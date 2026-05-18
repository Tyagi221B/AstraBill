---
type: decision
updated: 2026-05-18
sources: 1
---

# Phase 2 Plan — Customers, Products, then the WhatsApp Hero Loop

The build blueprint after Phase 1. Read alongside `DECISIONS.md`. Binding
facts live in `DECISIONS.md`; this page holds the *how* and the *sequence*.

## Where Phase 1 left off

Shipped + smoke-tested: auth (Google + WhatsApp OTP), business onboarding,
the full invoice CRUD loop (create / list / view / edit / finalise / delete)
with correct CGST/SGST/IGST math, RBAC, audit log, `proxy.ts` auth.
Architecture (route → service → repository → DB) proven across three
vertical slices. Schema live in Supabase Mumbai.

What Phase 1 does NOT have: real customers (invoices use `customerId: null`),
a product catalogue (all line items are custom), stock movement, PDF, WhatsApp
send, payments. And the schema can't yet express what the brother's real
invoices need (see [[customer/hardware-shop-owner]] → "Real Invoices").

## Phase 2A — Customers, Products, Invoice-anatomy migration  ← build first

No external dependencies. Buildable immediately. This is the detailed LLD.

### Step 1 — Schema migration (one Drizzle migration)

Additive only — every new column is nullable or defaulted, so the migration
is safe on the existing rows.

- `unit` enum → add `sqm` (glass bills in sq.m) and `set` (hardware sells in
  sets — "30 set @ ₹530/set").
- `invoice_type` enum → add `delivery_challan` (non-GST goods-movement note).
- `invoice_line_items` → add `secondary_quantity numeric(12,3)` (nullable),
  `secondary_unit unit` (nullable). The existing `quantity` + `unit` stay as
  the **rate-bearing** pair (GST math unchanged); the secondary pair is
  **informational** (glass: `quantity`=11.34 `unit`=sqm, `secondary`=4 pcs).
- `invoices` → add `ship_to_name text`, `ship_to_address text`,
  `extra_charges jsonb NOT NULL DEFAULT '[]'`, `transport_mode text`,
  `vehicle_number text`.
- `businesses` → add `invoice_terms text` (default T&C block printed on the
  PDF — late-payment interest, jurisdiction, etc.).
- **Extra charges** = a JSONB array of `{ label, amount }` (amounts stored as
  *strings* — keeps decimal precision and dodges the JSON-number trap).
  Real invoices carry Freight *and* Loading as separate rows, so a single
  `freight` column would be wrong — it's a list.
- `lib/gst.ts` → `computeInvoiceTotals` takes an optional `extraCharges`
  arg; `total = round(taxable + tax) + Σ extraCharges` (charges are added
  **post-tax, post-round-off** — matches the real invoices; not themselves
  taxed in V1).

⚠️ Reads that touch line items already use flat `db.select()` — keep it that
way (see the "Relational reads" rule in [[decision/database-and-rbac]]).

### Step 2 — Correctness gate: tests for `lib/gst.ts`

Before extending the GST math, lock the current behaviour. Add `vitest` +
unit tests for `lib/gst.ts`: intrastate vs interstate, 0/5/12/18/28%,
discounts, round-off both directions, and (new) freight. This is the
cheapest, highest-leverage correctness investment — do it first.

### Step 3 — Customers CRUD

Same layered pattern as invoices:
- `lib/schemas/customer.ts` — Zod (name required; phone / email / GSTIN /
  address optional).
- `lib/repositories/customers.ts` — insert / list / get / update /
  softDelete, all scoped by `business_id`.
- `lib/services/customers.ts` — `requirePermission('customer:*')`, audit
  entries, transactions.
- `app/api/customers` (GET list, POST) + `app/api/customers/[id]`
  (GET, PATCH, DELETE).
- UI: `/customers` list, create/edit pages.

### Step 4 — Products CRUD

Same shape (`lib/{schemas,repositories,services}/products.ts`, routes, UI).
Note: `products.purchasePrice` must be stripped for roles lacking
`report:view_profit` — use `redactForRole` from `lib/rbac.ts` at the
serialisation edge.

### Step 5 — Invoice form upgrades

- Customer picker (select a saved customer, or "walk-in" → `customerId:
  null`). Inline "new customer" shortcut.
- Product picker on line items (pulls name / HSN / rate / GST — snapshotted
  onto the line, as the schema already does).
- Dual-unit inputs: secondary quantity + unit per line.
- Ship-to fields (optional; default = same as bill-to).
- Freight, transport mode, vehicle number.
- `delivery_challan` as a type option (renders without GST).

### Step 6 — Stock movement on finalise

When an invoice with product-linked line items is finalised, write
`stock_movements` (`type: 'out'`) and decrement `products.stock`, inside the
finalise transaction. Drafts don't move stock.

## Phase 2B — WhatsApp Send + UPI  (the hero loop)

Higher-level here; detailed LLD when 2A is done. Three parts:

1. **PDF microservice** — separate Node + Express + Puppeteer service on
   Digital Ocean ([[decision/pdf-generation]]). Renders the invoice HTML →
   PDF → uploads to Cloudinary → returns the URL. AstraBill calls it via
   `PDF_SERVICE_URL`. Includes designing the actual invoice template —
   modern, mobile-readable, 2026-grade (not a carbon-copy clone).
2. **WhatsApp invoice send** — `astrabill_invoice_v1` template (PDF document
   header + payment-link button), sent through the BullMQ queue on the DO
   worker ([[decision/notifications-and-crons]]). `IWhatsAppProvider` already
   exists.
3. **Razorpay** — `IPaymentProvider` interface + `RazorpayProvider`. Payment
   Link per invoice; webhook → mark invoice paid → send receipt.

**The hero loop:** create invoice → finalise → "Send on WhatsApp" → PDF
generated → WhatsApp delivered with PDF + UPI link → customer pays → webhook
→ invoice `paid` → receipt sent. This is the demo that sells AstraBill.

## Sequencing & parallel work

1. **Now (parallel):** submit `astrabill_otp_v1` + `astrabill_invoice_v1`
   templates to Meta. Verification takes 1–3 days — start the clock so it
   isn't the bottleneck for 2B.
2. **Phase 2A** — no external deps, build immediately.
3. **Phase 2B** — by the time 2A is done, the templates are verified.
4. **Design pass** — invoice PDF template lands in 2B; general UI polish
   interleaves. Correctness first, then make it beautiful.

## Related Pages

- [[customer/hardware-shop-owner]] — the real invoices this plan is built from
- [[decision/v1-scope]] — the four V1 features
- [[decision/database-and-rbac]] — the flat-select rule for numeric tables
- [[decision/pdf-generation]] — the PDF microservice
- [[decision/payment-gateway]] — Razorpay
- [[decision/whatsapp-meta-api]] — the Meta send path
