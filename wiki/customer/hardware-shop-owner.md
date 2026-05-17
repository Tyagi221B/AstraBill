---
type: customer
updated: 2026-05-17
sources: 3
---

# Customer Profile: Hardware / Glass / Building Materials Shop Owner

## Profile

**Who**: Owner of a hardware, glass, plywood, sanitary, or construction materials shop. Often family-run. Annual revenue typically ₹50L-₹5Cr. Our first customer (the brother) fits this.

## Business Reality

These are **trading businesses** — they buy stock and sell it, often in bulk to contractors and builders, and retail to walk-in customers. This is more complex than a service business.

### What They Sell (Glass + Hardware)
- Glass: sold in sheets, cut to size → unit = sq. ft., linear ft., pieces
- Hardware: sold by piece, box, dozen, kg
- They often custom-cut glass and charge a cutting charge
- Transport is billed separately for bulk orders

### Who Buys From Them
- **Contractors and builders** (B2B) — large orders, credit extended 30-90 days, often informal
- **Walk-in retail customers** — small purchases, usually cash
- **Interior designers / architects** — regular repeat customers, credit accounts

### The B2B Credit Problem
Contractors rarely pay immediately. The shop owner extends ₹50K-₹5L in credit to multiple contractors simultaneously. This is the **kacha khata** — tracking who owes what informally. Recovering this money is a constant operational pain.

## The Kacha/Pakka Reality (Critical Insight)

**Pakka bill**: GST-compliant invoice. Formal. Goes in the books. Customer wants this for their own GST input credit claim.

**Kacha bill**: Informal / cash. No GST. Not in the formal books. Used for:
- Cash transactions where both parties want to avoid tax
- Partial documentation (bill for half the amount, rest is cash)
- Estimates and quotations that may not result in formal sale

**How common is this?** Extremely. The Delhi Bazar wholesale markets (Sadar Bazar, Chandni Chowk, Karol Bagh) explicitly run dual-book systems. Dedicated "kacha billing software" exists (Hargun Shop, ₹999 lifetime). Tally has literal guides on "Kacha & Pakka Bill Creation."

**One company positioned as "data management, not GST compliance"**: This is a known legal strategy in India. When regulators ask about compliance liability, the company says: "We only manage data. The merchant is responsible for their GST compliance." This protects the software company from liability when users misfile.

**Legal risk for AstraBill**: We cannot explicitly support kacha billing (tax evasion). But we also can't ignore this business reality. The smart play: see below.

## What This Customer Needs from Software

| Need | Priority | Notes |
|------|----------|-------|
| Multi-unit billing | 🔴 Critical | sq.ft., kg, pieces, linear ft. in same invoice |
| Cutting charges | 🔴 Critical | Custom charge per order |
| Transport charges | 🟠 High | Add as line item |
| GST auto-calculation | 🔴 Critical | Multiple rates in one bill |
| Customer credit tracking (udhaar) | 🔴 Critical | Who owes how much |
| Supplier (purchase) tracking | 🟠 High | What we owe vendors |
| Stock inventory | 🟠 High | Different from service business — physical stock |
| Payment collection | 🔴 Critical | WhatsApp reminder for contractor who hasn't paid |
| Pakka + kacha separation | 🟡 Medium | Legal grey zone — design carefully |

## How to Handle Kacha Accounts (The Product Decision)

**We DO NOT label anything "kacha" or "informal" in the product.** Legal risk.

**What we DO build:**
1. **Estimates / Quotations**: Create a quote → convert to invoice when they want GST bill. The unbilled quote = the "kacha" record without calling it that.
2. **Cash receipts**: Simple cash record without GST treatment — labeled "Receipt" not "Invoice"
3. **Draft invoices**: Saved but not finalized = no GST liability created yet
4. **The "data management" position**: Our terms clearly state we are a billing tool. The merchant is responsible for their tax compliance. We don't file on their behalf. This is the standard legal positioning.

**This way**: The contractor who pays cash gets a receipt. The contractor who needs GST gets an invoice. The shop owner tracks both. We never say "kacha" — we say "cash receipt" and "GST invoice."

## What the Competitor Landscape Looks Like for This Vertical

- **HisabKitab**: Specifically calls out hardware/plywood/glass. AI-assisted, cloud-based, built for trading businesses.
- **myBillBook**: Has hardware shop templates
- **BUSY**: Strong in retail/trading, multi-unit support
- **Marg ERP**: Pharmacy + retail focus, popular in trading

**Gap**: None of these have great WhatsApp integration or modern UX. They all look like Tally with a mobile app slapped on.

## Udhaar (Credit) Tracking = The Sticky Feature

**Udhaar** (informal credit extended to customers) is THE reason small shop owners touch their phone daily. "Who hasn't paid me" is more urgent than "create new invoice." If AstraBill makes udhaar tracking instant and recovery easy (WhatsApp nudge in one tap), the shop owner will check the app every morning.

This is the **daily active use** driver. Not invoicing — udhaar collection.

## Related Pages

- [[concept/whatsapp-billing-opportunity]] — udhaar recovery via WhatsApp
- [[competitor/vyapar]] — their main current software choice
- [[decision/market-validation]] — this customer validates the market
- [[concept/gst-compliance]] — pakka bill compliance requirement
