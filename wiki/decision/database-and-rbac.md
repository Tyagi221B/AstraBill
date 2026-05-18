---
type: decision
updated: 2026-05-17
sources: 0
---

# Database, Multi-tenancy, and RBAC

## Multi-Business: Yes, Build It Now

One user can belong to multiple businesses. This covers:
- MSME owner with two shops (glass + hardware AND a second venture)
- CA managing 10-50 client businesses from one login
- Business owner who added their accountant as a second user

The join table pattern handles this cleanly:

```
User (1) ──── (many) BusinessMember (many) ──── (1) Business
                         │
                      role: ENUM
                      ('owner', 'admin', 'accountant', 'salesman', 'viewer')
```

A user has a role **per business** — not a global role. The CA is 'viewer' in one client's books and 'accountant' in another's. The owner is 'owner' everywhere.

---

## No RLS — Isolation Lives in the Repository Layer

### Why no RLS at all

RLS exists to protect the database from an **untrusted client** — a browser holding
the Supabase anon key, talking to the DB directly. AstraBill has no such client.
Every query goes Browser → Next.js server-side API route → Drizzle → Postgres.

```
Browser → Next.js API route (server) → Drizzle → Supabase DB
                    ↑
            This is where isolation + RBAC live.
            TypeScript. Testable. Debuggable.
```

RLS was considered as "belt and suspenders" but it does not survive our auth decision:

- The canonical Postgres RLS pattern uses `auth.uid()` — a function that **only
  exists inside Supabase Auth**. We use [[decision/auth-strategy]] (NextAuth), so
  `auth.uid()` is always NULL → a policy built on it matches nothing.
- Our Drizzle connection uses a privileged Postgres role, which **bypasses RLS
  entirely** anyway.
- Making RLS genuinely work would need a non-privileged DB role + a per-request
  `SET app.user_id` GUC inside every transaction — exactly the RLS complexity we
  set out to avoid.

So: **no RLS.** Tenant isolation is enforced in application code, and that is
sufficient because there is no untrusted client.

### How isolation is actually guaranteed

1. **`businessId` on every table** — every business table (and every child table:
   line items, payments, stock movements, whatsapp messages) carries `business_id`.
2. **The repository layer is the only place queries live.** Every query scopes by
   `business_id`. One folder to audit. No query anywhere else.
3. **`requirePermission(userId, businessId, perm)`** runs in the service layer
   before every mutation — it verifies the user is a member of that business.

This is real protection, in TypeScript, unit-testable. No SQL policies, no triggers.

### Audit log

Billing software needs a trail: *who* raised this invoice, *who* recorded that
payment, *who* logged in. The `audit_log` table records every data mutation and
every auth event — actor, action, entity, a JSONB before/after diff, IP/UA.

It is written **from the service layer, inside the same transaction as the
mutation** — the audit row and the change commit together or not at all. Not a DB
trigger (triggers are a "Never" — logic stays in TypeScript), and not
fire-and-forget (an audit trail with silent gaps is worse than none). The table is
append-only: nothing ever updates or deletes an `audit_log` row.

### Soft delete

Business data is never hard-deleted. Mutable tables carry `deleted_at timestamptz`;
the repository layer filters `deleted_at IS NULL` by default. This preserves history
and keeps the audit trail's entity references valid.

"Delete" composes with the GST immutability rule: a *draft* invoice can be
soft-deleted; a *finalized* invoice never can — corrections go through a credit
note. Removing a teammate is a soft delete of their `business_members` row, not the
shared `users` account.

**RBAC in TypeScript** (where it belongs):
```typescript
// lib/rbac.ts — your single source of truth for permissions
const PERMISSIONS = {
  owner:       ['invoice:create', 'invoice:delete', 'report:view_profit', 'user:invite', 'settings:edit'],
  admin:       ['invoice:create', 'invoice:delete', 'report:view_profit', 'user:invite'],
  accountant:  ['invoice:create', 'report:view_profit', 'report:gst'],
  salesman:    ['invoice:create', 'customer:view'],   // NO profit visibility
  viewer:      ['invoice:view', 'customer:view'],
} as const

export async function requirePermission(
  userId: string,
  businessId: string,
  permission: Permission
) {
  const member = await db.query.businessMembers.findFirst({
    where: and(
      eq(businessMembers.userId, userId),
      eq(businessMembers.businessId, businessId)
    )
  })
  if (!member || !PERMISSIONS[member.role].includes(permission)) {
    throw new ForbiddenError()
  }
}

// Usage in any API route:
export async function POST(req: Request) {
  const session = await getServerSession()
  await requirePermission(session.user.id, businessId, 'invoice:create')
  // ... rest of handler
}
```

This is readable, testable, changeable. When you want to give salesmen profit visibility (a product decision), you change one line in `PERMISSIONS`. Not a SQL migration.

---

## MongoDB vs PostgreSQL — Let Me Be Straight

Your MongoDB intuition comes from two real things:
1. Schema definition in JS/TS feels natural
2. Relations as embedded documents (invoice with lineItems array) matches how you think

Both of those things now exist in PostgreSQL with **Drizzle ORM**. Here's what it looks like:

```typescript
// drizzle/schema.ts — this IS your schema, in TypeScript
import { pgTable, uuid, text, numeric, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const invoiceStatus = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue'])

export const invoices = pgTable('invoices', {
  id:          uuid('id').defaultRandom().primaryKey(),
  businessId:  uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  customerId:  uuid('customer_id').references(() => customers.id),
  number:      text('number').notNull(),
  status:      invoiceStatus('status').default('draft'),
  subtotal:    numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  taxAmount:   numeric('tax_amount', { precision: 12, scale: 2 }).notNull(),
  total:       numeric('total', { precision: 12, scale: 2 }).notNull(),
  notes:       text('notes'),
  dueDate:     timestamp('due_date'),
  paidAt:      timestamp('paid_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// Querying a single table — flat select, types flow through automatically
const [invoice] = await db
  .select()
  .from(invoices)
  .where(eq(invoices.id, invoiceId))
// invoice is fully typed. No `any`.
```

That's not scary. That's more structured than MongoDB and equally readable.

### ⚠️ Never use the relational `with:` API on tables with `numeric` columns

Drizzle's relational query API — `db.query.X.findFirst({ with: { child: true } })`
— is tempting (it reads like Mongoose `.populate()`). **Do not use it to pull
in a child relation that has `numeric` columns** (line items, payments, stock
movements — anything money/quantity-bearing).

Reason: the relational API fetches nested rows by having Postgres aggregate
them into JSON (`json_build_array`). A `numeric` column inside JSON becomes a
bare JSON *number*; `JSON.parse` then yields a JS `number`. That silently
destroys the `string` type Drizzle declares for `numeric()` columns and that
the rest of the stack (Zod boundary, `decimal.js` math) depends on — caught
the hard way during the invoice-edit build (2026-05-18).

**The rule:** for any read that joins a `numeric`-bearing table, use flat
`db.select()` queries and stitch rows together in JS. The repository layer
does exactly this for invoices + line items. Plain `db.query.X.findFirst()`
*without* `with:` is fine — only the JSON-aggregated nested path is the trap.

**Why PostgreSQL over MongoDB for billing software:**

| Concern | MongoDB | PostgreSQL + Drizzle |
|---------|---------|---------------------|
| Money precision | ❌ Float issues | ✅ NUMERIC(12,2) — exact |
| ACID transactions | Partial (replica set) | ✅ Full |
| Relations (invoice → line items) | Manual refs | ✅ Foreign keys + JOINs |
| Schema in TypeScript | Mongoose schemas | ✅ Drizzle schemas |
| Migrations | Manual | ✅ Drizzle Kit generates SQL |
| Supabase compatible | ❌ | ✅ Native |
| Enforce data integrity | ❌ Optional | ✅ Constraints |

For billing: money must be exact. An invoice total that's wrong by ₹0.01 due to float errors is a support nightmare. `NUMERIC(12,2)` in PostgreSQL is exact. MongoDB's default number type is a float — wrong for money.

**The learning curve**: Drizzle + Supabase is genuinely not much harder than Mongoose + MongoDB. 1-2 days to get comfortable. Worth it.

---

## Stack Decision: Drizzle ORM + Supabase PostgreSQL

- **ORM**: Drizzle (not Prisma — Drizzle is leaner, faster, closer to SQL when you need it)
- **DB**: Supabase PostgreSQL — used as a plain database ONLY
- **Migrations**: Drizzle Kit (`npx drizzle-kit push` in dev, `generate` + `migrate` in prod)
- **RLS**: None — isolation enforced in the repository/service layer (see above)
- **RBAC**: Application layer in TypeScript (`lib/rbac.ts`)

Auth is NOT part of this page — see [[decision/auth-strategy]]. AstraBill does
not use Supabase Auth. Supabase is a database, nothing more.

For all binding facts, see `DECISIONS.md` at the repo root.

## Related Pages

- [[decision/auth-strategy]] — NextAuth v5, the auth decision
- [[decision/infrastructure]] — Supabase is the DB layer
- [[customer/hardware-shop-owner]] — salesman RBAC (can't see margins) is critical
