---
type: decision
updated: 2026-05-17
sources: 0
---

# V1 Scope — What Ships First

## Committed Features (All Four, No Shortcuts)

| Feature | Why It's Non-Negotiable |
|---------|------------------------|
| GST invoice + PDF download | Core product. Without this, there's nothing. |
| WhatsApp send + UPI payment link | The hero feature. The reason to switch. |
| Udhaar tracker | Daily-use driver. The reason to open the app. |
| Basic inventory / stock tracking | First customer (hardware shop) can't work without it. |

All four must ship together. Shipping 3/4 means our first customer (the brother) can't fully switch from Tally.

## What Each Feature Requires

### 1. GST Invoice + PDF
- Product catalog with HSN codes, GST rates (0/5/12/18/28%)
- Multi-unit support: sq.ft., sq.m, kg, pieces, linear ft., box, dozen — incl.
  **dual-unit** lines (glass billed per sq.m, also counted in pcs). See
  [[decision/phase-2-plan]] for the line-item model.
- Custom line items: cutting charges, transport, labour (no product lookup needed)
- Auto-calculation: CGST/SGST for intrastate, IGST for interstate
- Business profile: name, address, GSTIN, logo, bank details
- PDF microservice (Puppeteer on DO): A4, print-ready, professional
- Invoice numbering: FY-aware `{prefix}/{FY}/{seq}` — see `DECISIONS.md` → "Invoice numbering"
- Credit note / debit note support (adjustments)

### 2. WhatsApp Send + UPI Payment Link
- Meta API: `astrabill_invoice_v1` template (PDF attachment + payment link button)
- Razorpay: payment link per invoice OR Smart Collect virtual UPI ID
- KYC handling: show invoice without payment link until Razorpay KYC complete → nudge
- Sending from AstraBill's number (not owner's) — message body must be explicit: "Ramesh Hardware has sent you this invoice via AstraBill"
- Payment received webhook → mark invoice PAID → send receipt on WhatsApp
- PDF URL: redirect via our server (`/i/[invoiceId]/pdf`) — never expose raw Supabase URL

### 3. Udhaar Tracker
- Customer ledger: all invoices per customer, total outstanding
- Status: Draft / Sent / Seen / Partially Paid / Paid / Overdue
- "Seen" status: Meta webhook `message.read` → show "Seen [time]" in udhaar list
- Overdue auto-detection: cron job on DO marks invoices overdue past due date
- Manual reminder: one-tap WhatsApp reminder from udhaar screen (DO worker queues it)
- Auto-reminder schedule: D+3, D+7, D+14 (configurable per business, Pro plan only)

### 4. Basic Inventory
- Product catalog: name, HSN code, unit, purchase price, selling price, current stock
- Stock deduction: when invoice is created (draft) or finalized (configurable)
- Low stock alert: set threshold per product → notification when stock falls below
- Stock addition: manual "stock in" entry (purchase from supplier)
- No barcode scanning in V1 (add in V1.1 — mobile camera via @zxing/library)
- No supplier management in V1 (just manual stock additions)

## What's NOT in V1 (Explicitly)

| Feature | When |
|---------|------|
| Barcode scanning | V1.1 |
| Supplier / purchase orders | V1.1 |
| GSTR-1 auto-filing | V2 |
| E-invoicing (IRP upload) | V2 (only needed >₹5Cr turnover) |
| Multi-location | V2 |
| CA dashboard (multi-client) | V2 |
| Hindi/regional language | V2 |
| Payroll | Not planned |
| Bank reconciliation | V2 |
| Recurring invoices | V1.1 |

## Language: English Only in V1

This is correct. Hindi support is ~3-4 weeks of extra work for translations, and the early adopters (tech-aware, referred through the brother's network) will be comfortable with English. Add Hindi in V2 to unlock Tier 2/3 at scale.

## WhatsApp: AstraBill's Number

Messages go from AstraBill's WhatsApp Business number. The contractor sees:

> **AstraBill** (Business Account)
> "Ramesh Hardware has sent you an invoice for ₹45,000.
> Invoice #INV-0047 | Due: 15 June 2026
> [View & Pay →]"

This is the DocuSign model — nobody complains that DocuSign contracts come from DocuSign, not from the lawyer. The sender context is clear in the message body.

**Important**: Our WhatsApp profile must be well-branded. Profile picture: AstraBill logo. Business name: "AstraBill". About: "Billing & payment platform for Indian businesses." This builds trust for the contractor receiving the invoice.

## The Actual V1 Database Tables Needed

**11 business tables.** Every table carries `business_id` (including child tables —
needed because tenant isolation is enforced by query scoping, see
[[decision/database-and-rbac]]).

```
businesses          — name, GSTIN, address, logo, bank details, state_code, plan
business_members    — userId, businessId, role, deleted_at
users               — name, phone (nullable, unique-when-present), email, last_login_at, last_active_at
customers           — businessId, name, phone, GSTIN, address, state_code, deleted_at
products            — businessId, name, HSN, unit, gstRate, purchasePrice, sellingPrice, stock, deleted_at
invoices            — businessId, customerId, type, number, status, originalInvoiceId (nullable),
                      subtotal, cgst, sgst, igst, roundOff, total, placeOfSupply, issueDate,
                      dueDate, createdBy, deleted_at
invoice_line_items  — businessId, invoiceId, productId (nullable), description, qty, unit,
                      unitPrice, gstRate, taxableValue, cgst, sgst, igst, amount
payments            — businessId, invoiceId, amount, method, razorpayId, createdBy, paidAt
whatsapp_messages   — businessId, invoiceId, templateName, messageId, status, sentAt, readAt
stock_movements     — businessId, productId, type (in/out), qty, invoiceId (nullable), note, createdAt
audit_log           — businessId (nullable), actorUserId (nullable), action, entityType,
                      entityId, changes (jsonb), ipAddress, userAgent, createdAt
```

Key schema decisions:
- **`invoices.type`** is an enum — see `DECISIONS.md` → "Invoice types" for the
  binding list (Phase 1 ships `tax_invoice | estimate | cash_receipt |
  credit_note | debit_note`; Phase 2 adds `delivery_challan`).
  Credit/debit notes and kacha/pakka ("Estimate"/"Cash Receipt") all live inside the
  `invoices` table — no separate tables. `originalInvoiceId` self-references for notes.
- **GST split columns** (`cgst`/`sgst`/`igst`) on both invoices and line items. Computed
  from `placeOfSupply` vs business `state_code`: intrastate → CGST+SGST, interstate → IGST.
- Invoice numbering — see `DECISIONS.md` → "Invoice numbering". Phase 1 shipped
  a simple per-type series; Phase 2A moved to FY-aware `{prefix}/{FY}/{seq}`,
  assigned at finalise. Concurrency-safe via a `FOR UPDATE` row lock in the
  finalise transaction — no counter table.
- **`audit_log`** records every mutation + auth event; **soft delete** (`deleted_at`)
  on mutable tables. See [[decision/database-and-rbac]] for both.
- **Timestamps**: `timestamptz` (UTC) for instants; Postgres `date` for `issue_date` /
  `due_date` (calendar dates); convert to IST at the display edge.

**Plus NextAuth adapter: `accounts`** (for the Google OAuth entry door). No `sessions`
table (JWT strategy). No `verification_token` (no email magic links). No `otp_codes`
(OTPs live in Redis).

**Total: 12 tables** (11 business + `accounts`). This is the full V1 schema. Manageable.

## Related Pages

- [[decision/pdf-generation]] — PDF microservice
- [[decision/whatsapp-meta-api]] — template setup
- [[decision/payment-gateway]] — Razorpay KYC handling
- [[decision/database-and-rbac]] — Drizzle schema
- [[customer/hardware-shop-owner]] — first customer this must serve
