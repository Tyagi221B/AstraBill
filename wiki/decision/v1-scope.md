---
type: decision
updated: 2026-05-22
sources: 0
status: superseded
superseded_by: full-ledger-pivot
---

# V1 Scope — Superseded

> **This page is superseded by [[decision/full-ledger-pivot]] (2026-05-21).**
> The current V1 scope — 21 must-have features, single-source-of-truth — lives in
> `DECISIONS.md` → "Product — V1 (Full-Ledger Pivot, 2026-05-21)". Read that first.

## Historical context (what this page used to say)

The original V1 framing was a four-feature **billing loop**:

1. GST invoice + PDF download
2. WhatsApp send + UPI payment link
3. Udhaar tracker
4. Basic inventory / stock tracking

Built on a 12-table schema with `customers`, `products`, `invoices`,
`invoice_line_items`, `payments`, `stock_movements` (product-bound),
`whatsapp_messages`, `audit_log`, `businesses`, `business_members`, `users`,
and the NextAuth `accounts` table.

That framing was **too narrow** for India's GST reality. SMEs *must* track
purchases for Input Tax Credit (ITC) reconciliation against supplier GSTR-1.
A billing-only product cannot credibly serve GST-registered businesses, which
is the entire ICP.

The pivot, decided 2026-05-21, broadened the scope to a **full GST books
surface**: Parties (customer | supplier), Items, Documents (8 doc types),
Payments, Ledger, Inventory, GST returns. See [[decision/full-ledger-pivot]]
for the why, [[competitor/mybillbook-architecture]] for the reference
shape, and `DECISIONS.md` for the binding 21-feature list.

## What carried forward unchanged

The pivot wiped the *domain layer* (schema + domain UI), not the
infrastructure. These V1 decisions still hold:

- **Language:** English only in V1; Hindi in V2.
- **WhatsApp sender identity:** Messages go from AstraBill's own number, not
  the shop owner's. The DocuSign model — the customer sees "AstraBill
  (Business Account)" and the body explicitly says "Ramesh Hardware has sent
  you this invoice via AstraBill." Profile picture, business name, and About
  field must be well-branded to build trust for the customer receiving the
  invoice. ([[decision/whatsapp-meta-api]])
- **Auth model:** NextAuth + JWT + two equal entry doors (Google OAuth +
  WhatsApp OTP). ([[decision/auth-strategy]])
- **Multi-business shell:** `/b/[businessId]/...` routing.
  ([[decision/white-label-app-shell]])
- **PDF microservice:** Puppeteer on a Digital Ocean droplet, never
  serverless. ([[decision/pdf-generation]])
- **UPI deep links** (no gateway for V1). ([[decision/upi-deep-links]])

## What got demolished (PR2 Step 11, 2026-05-22)

The old domain layer was atomically dropped: `customers`, `products`,
`invoices`, `invoice_line_items`, `payments`, the old product-bound
`stock_movements`. Replaced by the new schema: `parties`, `items`,
`documents`, `document_lines`, `document_charges`, `payment_entries`,
`payment_entry_allocations`, `ledger_entries`, `stock_movements`
(item-bound). See `wiki/log.md` 2026-05-22 entry for the demolition
record.

## Related pages

- [[decision/full-ledger-pivot]] — the new direction (canonical)
- `DECISIONS.md` → "Product — V1 (Full-Ledger Pivot, 2026-05-21)" — binding scope
- [[competitor/mybillbook-architecture]] — reference architecture
- [[concept/gst-compliance]] — why ITC reconciliation forced the pivot
