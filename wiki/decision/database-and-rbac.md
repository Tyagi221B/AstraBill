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

## RLS vs Application-Layer RBAC — The Real Answer

The user's instinct is correct. Here's why RLS gets painful:

**RLS is great when**: your app lets the frontend talk directly to Supabase (the Supabase JS client hitting the DB from the browser). RLS is the security layer protecting the DB from untrusted clients.

**RLS becomes a maintenance nightmare when**:
- You have complex role hierarchies (owner vs salesman vs CA)
- Business logic changes frequently (in early startup = always)
- You're debugging a bug at 2am and it's a SQL policy issue not a code issue
- You need to test it (you can't unit test SQL policies easily)
- DB triggers encode business rules — now your logic is split between TypeScript and SQL

**For AstraBill**: ALL data access goes through Next.js server-side API routes. The browser never talks to Supabase directly. There is no untrusted client hitting the DB.

```
Browser → Next.js API route (server) → Supabase DB
                    ↑
            This is where RBAC lives.
            TypeScript. Testable. Debuggable.
```

### Decision: Minimal RLS + Full App-Layer RBAC

**RLS policy** (just ONE, simple):
```sql
-- Belt and suspenders: even if a bug in our code passes the wrong userId,
-- the DB still refuses to return another business's data.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_isolation" ON invoices
  FOR ALL USING (
    business_id IN (
      SELECT business_id FROM business_members
      WHERE user_id = auth.uid()
    )
  );
```

Apply this same simple policy to every table. That's it for RLS. No complex conditions, no triggers, no role-specific policies in SQL.

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

// Querying — reads like Mongoose, types flow through automatically
const invoice = await db.query.invoices.findFirst({
  where: eq(invoices.id, invoiceId),
  with: {
    lineItems: true,   // JOIN — as simple as Mongoose .populate()
    customer:  true,
    business:  true,
  }
})
// invoice.lineItems is typed. invoice.customer is typed. No any.
```

That's not scary. That's more structured than MongoDB and equally readable.

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
- **RLS**: One simple business-isolation policy per table (see above)
- **RBAC**: Application layer in TypeScript (`lib/rbac.ts`)

Auth is NOT part of this page — see [[decision/auth-strategy]]. AstraBill does
not use Supabase Auth. Supabase is a database, nothing more.

For all binding facts, see `DECISIONS.md` at the repo root.

## Related Pages

- [[decision/auth-strategy]] — NextAuth v5, the auth decision
- [[decision/infrastructure]] — Supabase is the DB layer
- [[customer/hardware-shop-owner]] — salesman RBAC (can't see margins) is critical
