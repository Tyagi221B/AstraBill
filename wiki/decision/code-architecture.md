---
type: decision
updated: 2026-05-22
sources: 0
---

# Code Architecture — LLD Principles

## Core Philosophy

API routes are dumb. Services are smart. Providers are swappable. The DB doesn't know about business rules.

Every layer has one job. Nothing bleeds into another layer.

## Folder Structure

Reflects the post-PR2 full-ledger domain. AstraBill flattens the `server/`
split — services + repositories sit directly under `lib/`, which Next.js
keeps server-only as long as nothing in those paths runs on the client.

```
app/                                  # Next.js 16 App Router
├── (marketing)/                       # Marketing site (own layout chrome)
├── sign-in/                           # Auth entry
├── onboarding/                        # Post-auth business-creation wizard
├── b/[businessId]/                    # Every authed business-scoped page
│   ├── layout.tsx                     # Membership resolution (one place)
│   ├── dashboard/
│   ├── parties/                       # Customers + suppliers, one table
│   ├── items/                         # Products + services, one table
│   ├── cash-and-bank/                 # Money accounts
│   ├── sales/                         # sales_invoice · quotation · credit_note
│   ├── purchases/                     # purchase_invoice · debit_note
│   ├── reports/                       # Sales/Purchase Register, GSTR-1, etc.
│   └── settings/
├── i/[shareToken]/                    # Public, auth-free document view
└── api/                               # API routes — THIN layer only
    ├── auth/                          # NextAuth callbacks + OTP
    ├── businesses/
    ├── parties/
    ├── items/
    ├── documents/                     # All 8 doc types share routes
    │   ├── route.ts                   # POST (create draft)
    │   └── [id]/
    │       ├── route.ts               # GET / PATCH (edit) / DELETE
    │       ├── pdf/route.ts           # Authed PDF render
    │       └── send-whatsapp/route.ts # Meta send
    ├── payment-entries/
    ├── money-accounts/
    ├── document-counters/
    ├── item-categories/
    ├── item-units/
    ├── uploads/                       # Cloudinary signature endpoint
    ├── reports/
    ├── otp/
    └── i/[shareToken]/pdf/route.ts    # Public PDF (token IS the auth)

lib/                                   # Server-side business code + shared utils
├── db/
│   ├── schema.ts                      # All tables in one file (Drizzle)
│   └── relations.ts                   # Drizzle relations (no `with:` on numerics)
├── repositories/                      # DB queries — every query scoped by businessId
│   ├── businesses.ts
│   ├── parties.ts
│   ├── items.ts
│   ├── documents.ts
│   ├── payment-entries.ts
│   ├── money-accounts.ts
│   ├── ledger-entries.ts
│   ├── stock-movements.ts
│   ├── document-counters.ts
│   ├── item-categories.ts
│   ├── item-units.ts
│   └── whatsapp-messages.ts
├── services/                          # Orchestration + RBAC + side effects
│   ├── documents.ts
│   ├── parties.ts
│   ├── items.ts
│   ├── payment-entries.ts
│   ├── document-pdf.ts                # Builds RenderRequest, calls PDF service
│   ├── public-document.ts             # Token-auth read path
│   ├── whatsapp-send.ts               # Meta Cloud API binding
│   ├── dashboard.ts
│   ├── reports.ts
│   └── businesses.ts
├── schemas/                           # Zod schemas — input validation at API edge
│   ├── party.ts
│   ├── item.ts
│   ├── document.ts
│   └── payment-entry.ts
├── pdf/                               # PDF render contract (mirrored in pdf-service/)
│   ├── contract.ts                    # RenderRequest / RenderResponse types
│   └── fixtures.ts
├── rbac.ts                            # PERMISSIONS map + requirePermission()
├── routes.ts                          # SSOT for URL structure (routes.b(id).…)
├── errors.ts                          # AppError, NotFoundError, ForbiddenError, …
├── session.ts                         # NextAuth session helper
└── gst.ts                             # GST math (pure, testable)

components/
├── ui/                                # shadcn/ui primitives
├── app/                               # In-app chrome (Sidebar, MobileNav, …)
├── marketing/                         # Marketing-site chrome
└── theme/                             # next-themes provider
```

## The Layering Rule (Strict)

```
API Route → Service → Repository → DB
    ↓           ↓
  Zod         Provider (payment, whatsapp, storage)
  validate    (interface, not concrete)
```

- **API routes**: validate input (Zod), call service, return response. Nothing else.
- **Services**: business logic, orchestration, RBAC check. No raw DB calls.
- **Repositories**: all DB queries. No business logic. Returns domain objects.
- **Providers**: external services behind interfaces. Never called directly from services — always via the interface.

## How a Request Flows (Document Creation Example)

A sales-invoice create is the canonical authed write path. Same shape applies
to every doc type (estimate, credit_note, purchase_invoice, debit_note,
quotation, proforma_invoice, delivery_challan).

```typescript
// 1. API Route — thin
// app/api/documents/route.ts
export async function POST(req: Request) {
  const user = await requireUser()                          // NextAuth + 401 if absent
  const body = CreateDocumentSchema.parse(await req.json()) // Zod boundary
  const doc = await documentService.createDraft(user.id, body)
  return Response.json(doc, { status: 201 })
}

// 2. Service — business logic
// lib/services/documents.ts
export async function createDraft(userId: string, input: CreateDocumentInput) {
  // RBAC + tenant isolation first
  await requirePermission(userId, input.businessId, 'document:create')

  // Per-line GST math runs through gst.ts (pure, testable, money-as-string)
  const totals = computeDocumentTotals(input.lines, input.charges)

  // Persist in one transaction — doc + lines + charges
  return db.transaction(async (tx) => {
    const doc = await insertDocumentTx(tx, {
      ...input,
      ...totals,
      status: 'draft',           // numbering happens at finalise, not create
      number: null,
    })
    await insertDocumentLinesTx(tx, doc.id, input.lines)
    await insertDocumentChargesTx(tx, doc.id, input.charges)
    return doc
  })
}

// Finalise is a separate service call: it assigns the FY-aware sequence
// number (FOR UPDATE on document_counters), stamps share_token, flips
// status draft → unpaid, and posts the ledger leg. See documents.ts.

// 3. Repository — only DB queries, every query scopes by businessId
// lib/repositories/documents.ts
export async function getDocumentForUser(
  userId: string,
  documentId: string,
): Promise<Document | null> {
  // Membership check happens once in the service layer; the repo enforces
  // tenant scoping defensively. Flat select() — no `with:` on numeric children.
  const [doc] = await db
    .select()
    .from(documents)
    .innerJoin(businessMembers, eq(businessMembers.businessId, documents.businessId))
    .where(and(
      eq(documents.id, documentId),
      eq(businessMembers.userId, userId),
      isNull(businessMembers.deletedAt),
    ))
  return doc ?? null
}

// 4. Provider boundary — only where one exists
// V1 has no IPaymentProvider (UPI deep links are stateless, no gateway).
// V1 has no IWhatsAppProvider interface yet either; the Meta Cloud API
// binding lives in lib/services/whatsapp-send.ts. The interface gets
// introduced when a second WhatsApp provider arrives, not before.
//
// PDF rendering goes over HTTP to the DO microservice — see lib/pdf/contract.ts
// for the RenderRequest shape (mirrored in pdf-service/src/contract.ts).
```

## Error Handling — Typed Errors

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(public message: string, public statusCode: number) {
    super(message)
  }
}
export class NotFoundError    extends AppError { constructor(m = 'Not found')    { super(m, 404) } }
export class ForbiddenError   extends AppError { constructor(m = 'Forbidden')    { super(m, 403) } }
export class ValidationError  extends AppError { constructor(m: string)          { super(m, 400) } }
export class ConflictError    extends AppError { constructor(m: string)          { super(m, 409) } }

// Global handler in API routes (or middleware)
function handleError(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message }, { status: error.statusCode })
  }
  if (error instanceof ZodError) {
    return Response.json({ error: error.flatten() }, { status: 400 })
  }
  console.error(error)
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
```

## Key Principles Summary

1. **Thin routes**: validation + delegate. That's it. No `if/else` business logic.
2. **Services own logic**: RBAC, calculations, orchestration. Pure TypeScript.
3. **Repos own queries**: One place all DB code lives. Easy to audit.
4. **Interfaces for externals**: `IPaymentProvider`, `IWhatsAppProvider`. Swap without touching callers.
5. **Zod at the boundary**: validate at API entry. Inside the system, trust the types.
6. **Queue side effects**: PDF generation, WhatsApp sends are async. API returns fast.
7. **No business logic in DB**: No triggers, no stored procedures. SQL does data, TypeScript does logic.
8. **Typed errors**: `ForbiddenError`, `NotFoundError` — not strings, not generic `Error`.

## Related Pages

- [[decision/database-and-rbac]] — repo layer uses Drizzle
- [[decision/auth-strategy]] — auth() call in every API route
- [[decision/payment-gateway]] — IPaymentProvider interface
