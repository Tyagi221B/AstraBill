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
- Multi-unit support: sq.ft., kg, pieces, linear ft., box, dozen (on line items)
- Custom line items: cutting charges, transport, labour (no product lookup needed)
- Auto-calculation: CGST/SGST for intrastate, IGST for interstate
- Business profile: name, address, GSTIN, logo, bank details
- PDF microservice (Puppeteer on DO): A4, print-ready, professional
- Invoice numbering: auto-incrementing per business (INV-001, INV-002...)
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

```
businesses          — name, GSTIN, address, logo, bank details
business_members    — userId, businessId, role
users               — phone, name, createdAt
customers           — businessId, name, phone, GSTIN, address
products            — businessId, name, HSN, unit, gstRate, purchasePrice, sellingPrice, stock
invoices            — businessId, customerId, number, status, subtotal, taxAmount, total, dueDate
invoice_line_items  — invoiceId, productId (nullable), description, qty, unit, unitPrice, gstRate, amount
payments            — invoiceId, amount, method, razorpayId, paidAt
whatsapp_messages   — invoiceId, templateName, messageId, status, sentAt, readAt
stock_movements     — productId, type (in/out), qty, invoiceId (nullable), note, createdAt
otp_codes           — phone, codeHash, expiresAt, usedAt
```

This is the full V1 schema. Manageable.

## Related Pages

- [[decision/pdf-generation]] — PDF microservice
- [[decision/whatsapp-meta-api]] — template setup
- [[decision/payment-gateway]] — Razorpay KYC handling
- [[decision/database-and-rbac]] — Drizzle schema
- [[customer/hardware-shop-owner]] — first customer this must serve
