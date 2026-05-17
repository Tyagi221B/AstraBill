---
type: decision
updated: 2026-05-17
sources: 0
---

# Code Architecture — LLD Principles

## Core Philosophy

API routes are dumb. Services are smart. Providers are swappable. The DB doesn't know about business rules.

Every layer has one job. Nothing bleeds into another layer.

## Folder Structure

```
src/
├── app/                          # Next.js 16 App Router
│   ├── (auth)/                   # Login, OTP pages
│   ├── (dashboard)/              # App: invoices, customers, reports
│   │   ├── layout.tsx            # Dashboard shell, sidebar
│   │   ├── invoices/
│   │   ├── customers/
│   │   ├── udhaar/               # Credit/payment tracking
│   │   └── reports/
│   └── api/                      # API routes — THIN layer only
│       ├── invoices/
│       │   ├── route.ts          # GET (list), POST (create)
│       │   └── [id]/
│       │       └── route.ts      # GET, PATCH, DELETE
│       ├── customers/
│       ├── auth/
│       │   └── otp/
│       │       ├── send/route.ts
│       │       └── verify/route.ts
│       └── webhooks/
│           ├── razorpay/route.ts
│           └── whatsapp/route.ts
│
├── server/                       # Server-only — never imported on client
│   ├── services/                 # Business logic lives here
│   │   ├── invoice.service.ts
│   │   ├── customer.service.ts
│   │   ├── udhaar.service.ts
│   │   ├── pdf.service.ts        # Calls DO PDF microservice
│   │   ├── whatsapp.service.ts   # Queues WhatsApp jobs
│   │   └── auth.service.ts       # OTP generation + verification
│   │
│   ├── repositories/             # All DB queries live here
│   │   ├── invoice.repo.ts
│   │   ├── customer.repo.ts
│   │   ├── business.repo.ts
│   │   └── udhaar.repo.ts
│   │
│   ├── providers/                # External integrations — interface-driven
│   │   ├── payment/
│   │   │   ├── payment.interface.ts   # IPaymentProvider
│   │   │   ├── razorpay.provider.ts
│   │   │   └── index.ts               # export active provider
│   │   ├── whatsapp/
│   │   │   ├── whatsapp.interface.ts  # IWhatsAppProvider
│   │   │   ├── meta.provider.ts
│   │   │   └── index.ts
│   │   └── storage/
│   │       ├── storage.interface.ts   # IStorageProvider
│   │       └── supabase.provider.ts
│   │
│   ├── rbac/
│   │   ├── permissions.ts        # PERMISSIONS map: role → string[]
│   │   └── require-permission.ts # requirePermission(userId, businessId, perm)
│   │
│   ├── db/
│   │   ├── schema/
│   │   │   ├── businesses.ts
│   │   │   ├── users.ts
│   │   │   ├── invoices.ts
│   │   │   ├── invoice-line-items.ts
│   │   │   ├── customers.ts
│   │   │   ├── products.ts
│   │   │   ├── udhaar.ts
│   │   │   └── index.ts          # re-export all tables
│   │   └── index.ts              # drizzle client singleton
│   │
│   └── queue/
│       ├── queues.ts             # BullMQ queue definitions
│       └── workers/
│           ├── whatsapp.worker.ts
│           └── pdf.worker.ts
│
├── lib/                          # Shared, safe to import anywhere
│   ├── errors.ts                 # AppError, NotFoundError, ForbiddenError, etc.
│   ├── validations/              # Zod schemas — single source of truth for types
│   │   ├── invoice.schema.ts
│   │   └── customer.schema.ts
│   └── constants.ts
│
└── components/
    ├── ui/                       # shadcn/ui base (button, input, etc.)
    └── features/                 # Feature components, colocated with feature
        ├── invoices/
        │   ├── invoice-form.tsx
        │   └── invoice-table.tsx
        └── udhaar/
            └── udhaar-tracker.tsx
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

## How a Request Flows (Invoice Creation Example)

```typescript
// 1. API Route — thin
// app/api/invoices/route.ts
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const body = CreateInvoiceSchema.parse(await req.json())  // throws ZodError if invalid
  const invoice = await invoiceService.create(session.user.id, body)
  return Response.json(invoice, { status: 201 })
}

// 2. Service — business logic
// server/services/invoice.service.ts
class InvoiceService {
  async create(userId: string, dto: CreateInvoiceDTO) {
    // RBAC first — always
    await requirePermission(userId, dto.businessId, 'invoice:create')

    // Business logic
    const number = await this.generateInvoiceNumber(dto.businessId)
    const totals = this.calculateTotals(dto.lineItems)

    // Persist via repo (not direct DB)
    const invoice = await invoiceRepo.create({ ...dto, number, ...totals })

    // Side effects — queued, not blocking
    await whatsappService.queueInvoiceReady(invoice.id)  // if auto-send enabled
    await pdfService.queueGeneration(invoice.id)

    return invoice
  }

  private calculateTotals(lineItems: LineItemDTO[]) {
    // Pure function — testable without DB
    const subtotal = lineItems.reduce((sum, item) =>
      sum + (item.quantity * item.unitPrice), 0
    )
    const taxAmount = lineItems.reduce((sum, item) =>
      sum + (item.quantity * item.unitPrice * item.gstRate / 100), 0
    )
    return { subtotal, taxAmount, total: subtotal + taxAmount }
  }
}
export const invoiceService = new InvoiceService()

// 3. Repository — only DB queries
// server/repositories/invoice.repo.ts
class InvoiceRepository {
  async create(data: InsertInvoice) {
    const [invoice] = await db.insert(invoices).values(data).returning()
    return invoice
  }

  async findById(id: string, businessId: string) {
    return db.query.invoices.findFirst({
      where: and(eq(invoices.id, id), eq(invoices.businessId, businessId)),
      with: { lineItems: true, customer: true }
    })
  }
}
export const invoiceRepo = new InvoiceRepository()

// 4. Provider — swappable interface
// server/providers/payment/payment.interface.ts
export interface IPaymentProvider {
  createPaymentLink(invoice: Invoice): Promise<{ url: string; id: string }>
  createVirtualUPI(ref: string): Promise<{ upiId: string }>
  handleWebhook(payload: unknown): Promise<PaymentEvent>
}
// server/providers/payment/index.ts
export const paymentProvider: IPaymentProvider = new RazorpayProvider()
// Tomorrow if we switch to Cashfree: change this one line.
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
