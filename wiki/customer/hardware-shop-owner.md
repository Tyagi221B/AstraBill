---
type: customer
updated: 2026-05-18
sources: 6
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

## Real Invoices — Om Glass Enterprises (ground-truth source)

The brother's own shop. Three documents photographed and shared 2026-05-18 —
two GST tax invoices and one delivery challan. **This is the spec, not a
mockup.**

### What a real tax invoice contains (Invoice #203)

- **Header**: logo, business name, tagline ("Deals in All Types of Glass and
  Hardware"), full address, mobile, seller GSTIN + state code, "TAX INVOICE".
- **Original / Duplicate / Triplicate** marked (White / Pink / Yellow) — the
  GST 3-copy convention (buyer / transporter / seller). A PDF/print concern.
- **Recipient block**: name, address, GSTIN, state, state code, date.
- **Line items**: Sr. No, Name of Product/Service, HSN Code, **Qty in TWO
  columns — Pcs AND Sq.Mt**, Rate, Taxable Value.
- **Totals**: Total, SGST %, CGST %, IGST %, Round off, **Freight**, Total
  Invoice Value, plus the **amount in words**.
- **Bank details**: name, account no., IFSC.
- **Shipped To** block — *separate* from the recipient (bill-to ≠ ship-to).
- **Transport mode + Vehicle No.**, Authorised Signatory.

### The dual-unit insight (the most important finding)

A glass line reads: *12mm Toughened · HSN 70071900 · **04 Pcs** · **11.34
Sq.Mt** · ₹1506/sq.mtr · ₹17,078.04*.

Glass is **sold by area** (rate is per sq.metre, taxable value = `area ×
rate`) but **counted in pieces**. Both numbers sit on one line. A single
`quantity` + `unit` per line cannot express this — the line needs a
rate-bearing pair (area) **and** an informational secondary pair (pieces).
No generic billing app handles this cleanly; it's a genuine moat for the
trading vertical. Design in [[decision/phase-2-plan]].

### The challan (Challan #601)

A non-GST delivery note: "Azam", no GSTIN, particulars (Handle 12", locks),
qty / rate / remarks, total, "Received the material in Good Condition". The
kacha / delivery-note reality — to be handled by a `delivery_challan`
invoice type with no GST treatment.

### A supplier invoice (Hitesh Hardware, Delhi → Om Glass, #2843)

The buy side — the brother's shop *receiving* a bill. Same invoice anatomy,
three extra lessons:

- **Interstate confirmed.** Seller TIN `07…` (Delhi), buyer GSTIN `05…`
  (Uttarakhand) → the invoice charges **IGST @ 18%**, with CGST/SGST blank.
  Real-world validation of the `classifyTax` rule.
- **The `set` unit.** "Ground Bottom Fitting — 30 **set** — ₹530/set."
  Hardware sells in sets — a unit our enum was missing.
- **Extra charges are a list.** This invoice has **both** "Loading" *and*
  "Freight" as separate rows. A single `freight` field is wrong — invoices
  need a flexible list of named post-tax charges.
- **Terms & Conditions** printed on the invoice: late-payment interest
  ("24% if not paid within 15 days"), "goods once sold not taken back",
  jurisdiction. → a business-level default terms block on the PDF.

### A computerised invoice (Diamond Tuff Glass → Shiv Shakti, #4983)

The only **software-generated** invoice in the set — i.e. the competitor
bar. Functional but ugly: cramped, watermark-smothered, generic Tally-style
output. What it adds:

- **Taxable vs non-taxable charges.** A "Hole, Cut Out Template Charge"
  (₹724) is added to the product total → **taxable value → then 18% GST**.
  Processing / cutting / hole charges are *taxed*; freight is often
  post-tax. So a charge needs a **`taxable` flag** — a single post-tax
  `freight`/`extra_charges` model is incomplete.
- **FY-aware numbering** — `DTG/24-25/4983` = prefix / financial year /
  sequence. GST Rule 46 requires numbers "unique for a financial year".
  AstraBill adopts this: `{prefix}/{FY}/{seq}`, resets per FY.
- **HSN-wise tax summary** — a table grouping taxable value + tax by HSN +
  rate. GST / GSTR-1 compliance; derived from line items, rendered on the PDF.
- **E-Way Bill No.** field — mandatory for consignments over ₹50,000.
- **P.I. (Proforma Invoice) reference** — the tax invoice cites the proforma
  it converted from; this is our `estimate` → `tax_invoice` flow.
- UPI QR + "no cash" note + GST declaration text — PDF-template elements.

**The takeaway:** a small glass shop's *current best software* produces a
cramped, ugly document. A clean modern AstraBill PDF looks a decade ahead —
this is winnable on design alone.

## What This Customer Needs from Software

| Need | Priority | Notes |
|------|----------|-------|
| Dual-unit billing | 🔴 Critical | Glass billed per sq.m, also counted in pcs — both on one line. Plus kg / box / dozen / linear ft. for hardware |
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
