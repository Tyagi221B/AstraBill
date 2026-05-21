---
type: decision
updated: 2026-05-21
sources: 2
---

# Full-ledger pivot — AstraBill is GST books, not a billing loop

## Decision (2026-05-21)

AstraBill is being rebuilt as a **full GST books surface** — Parties, Sales,
Purchases, Payments, Ledger, Inventory, GST returns — modelled on
[[competitor/mybillbook-architecture]]. The earlier "billing loop only"
framing in `decision/v1-scope.md` is **superseded** by this page.

## What changed and why

**Before (decision/v1-scope.md):** AstraBill = GST invoice + PDF + WhatsApp
+ UPI link + Udhaar + Inventory. No payables. No purchases. Customers only.
The framing was: *we are a billing loop, not Tally-lite.*

**Now:** that framing is too narrow. The user's market research after the
2026-05-21 myBillBook screenshot ingest confirmed Indian SMEs **need**
supplier + purchase tracking. The hard requirement is **Input Tax Credit
(ITC) reconciliation** — every GST-registered business must claim ITC on
purchase GST against output sales GST. Without purchases, AstraBill cannot
credibly serve GST businesses, which is our entire ICP.

## Scope of the pivot

Anchored to myBillBook's surface (see [[competitor/mybillbook-architecture]]
for the architecture teardown):

| Layer | Inclusions |
|---|---|
| **Parties** | Customer + Supplier (one record can be both), opening balance, credit terms, GSTIN/PAN, contact person, addresses, bank, category, custom fields |
| **Sales** | Tax Invoice · Estimate · Delivery Challan · **Credit Note** (sales return) · Payment-In |
| **Purchases** | Purchase Bill · Purchase Order · **Debit Note** (purchase return) · Payment-Out · Expenses |
| **Inventory** | Stock on hand, in/out movement, valuation (method TBD) |
| **Ledger** | Per-party running balance; Cash & Bank accounts as first-class ledger entities |
| **GST returns** | GSTR-1 (outward), GSTR-3B (summary), ITC reconciliation, HSN-wise summary |
| **Reports** | P&L, balance sheet, trial balance, receivables/payables ageing, sales/purchase register |
| **E-invoicing** | IRN + QR for ≥ ₹5cr turnover businesses |

## Approach — copy first, improve second

User's framing (2026-05-21): *"lets just fucking go and copy everything of
billbook then we will make it better."*

**Method:**

1. **Research first.** Every entity / form / report observed in myBillBook
   gets documented in [[competitor/mybillbook-architecture]] before any
   code is written.
2. **Copy, then improve.** Match myBillBook's feature shape so an Indian
   SME finds the product *familiar*. Improvements happen as separate,
   conscious decisions — captured in their own `decision/*.md` pages.
3. **Don't discard infrastructure.** Keep Next.js shell, auth, multi-
   business, theming, PDF service, WhatsApp, UPI link gen, Loops email,
   marketing site. Wipe and redesign only the domain layer (schema +
   domain UI).

## Explicitly OUT of V1 scope (deferred to V2+)

These are real features myBillBook ships but we're consciously skipping
for V1 because our ICP (₹50L–₹2cr turnover shop owners) doesn't need them
and the build complexity is high:

- **TDS (Tax Deducted at Source)** — only required for audit-grade
  businesses (turnover > ₹1cr) or all companies/LLPs. Our ICP doesn't
  trigger it. Adding it requires section codes (194C/J/I/etc.), per-
  section rate config, auto-deduction on invoices/payments, Form 16A
  certificate generation, quarterly 26Q return exports. ~2-3 week
  feature on its own. Defer to V2.
- **TCS (Tax Collected at Source)** — only kicks in for businesses
  > ₹10cr turnover. Our ICP is nowhere near. Same complexity profile
  as TDS. Defer to V2.
- **e-Invoicing (IRN/QR generation)** — mandatory only for businesses
  > ₹5cr turnover. Requires GSP integration. Defer to V2.
- **SharedLedger** (myBillBook-to-myBillBook reconciliation) — network
  effect feature, requires our users to be on AstraBill on both sides.
  Defer until we have meaningful user base.
- **Close Financial Year** flow — myBillBook has a button to close the
  FY (lock prior data, snapshot reports, restart numbering). For V1 we
  just default FY to April–March and don't expose closure UI.
- **Smart Greetings** (auto WhatsApp on customer birthday / invoice
  milestones) — CRM-lite feature, nice-to-have. Defer.

User confirmation 2026-05-21: *"Yeah. Let's go with that and add it in
version 2 later if we need it."*

## What gets wiped (no real users yet → no migration pain)

- `customers` table → replaced by `parties`
- `invoices` table → split or generalised into proper sales doc model
  (tax_invoice, estimate, delivery_challan share a base; credit_note is
  new; purchase docs are sibling shape)
- Domain UI: customer form, invoice form, customer list — rebuild on new
  schema (the *patterns* from the current invoice form — sticky bar,
  accordions, totals card — are good and propagate forward).
- Sidebar nav: customers/products → parties/items/sales/purchases.

## What does NOT change

- Auth (NextAuth + JWT + Google OAuth + WhatsApp OTP)
- Multi-business shell (`/b/[businessId]/...` routing — see
  [[decision/white-label-app-shell]])
- Theming / UI primitives — Tailwind v4, shadcn, light-first
- PDF service (DO droplet + token + signing)
- WhatsApp send (Meta WABA + template binding)
- UPI deep links — see [[decision/upi-deep-links]]
- Marketing site (`/`, `/sign-in`, etc.)
- Email infra (Loops.so + `hello@astrabill.com`)
- Deployment (Vercel + Supabase + Cloudflare)

## Open architectural questions (must lock before schema)

1. **Party model shape:** type enum (customer | supplier | both) on one
   `parties` row vs. role table. *Leaning: enum on one row, mirrors
   myBillBook.*
2. **Accounting model:** single-entry (running balance per party,
   computed on the fly — myBillBook style) vs. double-entry (every
   transaction posts balanced debits/credits — Tally/Zoho Books style).
   *Open — needs research call.*
3. **Inventory:** include in V1 of the schema (gate UI later) vs. defer
   entirely. *Leaning: include in schema now — we already had inventory
   in old v1-scope.*
4. **Chart of accounts:** hardcoded category tree (Income / Expense /
   Asset / Liability / Equity) vs. fully customisable. *Leaning:
   hardcoded for V1, leave a `code` field for future custom accounts.*
5. **Numbering schemes:** per doctype × business × financial year (1
   April–31 March rollover). FY-bound counters are an Indian-statutory
   norm — likely yes.
6. **Audit trail:** event log for every CRUD on financial docs.
   GST audit defence may require this. *Leaning: full event log.*
7. **Soft delete vs. hard delete:** GST-finalised docs probably can't
   be deleted, only voided. *Leaning: cancel/void pattern, never
   hard-delete a finalised doc.*

## What this supersedes / kills

Hard delete from DECISIONS.md and the wiki once new direction lands:

- `decision/v1-scope.md` — the "billing loop" framing is gone. V1 scope
  is now "shippable subset of the full books surface" — TBD.
- DECISIONS.md row for V1 inclusions (GST invoice + PDF + WhatsApp +
  Udhaar + Inventory) — replace with new V1 row anchored to the new
  schema.

This page is the rationale. The new V1 scope row goes in DECISIONS.md
once architectural questions 1–7 are settled.

## Related pages

- [[competitor/mybillbook-architecture]] — what we're copying
- [[competitor/mybillbook]] — positioning context
- [[competitor/vyapar]] — second reference
- [[concept/gst-compliance]] — why ITC reconciliation is non-negotiable
- [[decision/v1-scope]] — superseded
