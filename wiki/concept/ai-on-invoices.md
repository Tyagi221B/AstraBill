---
type: concept
updated: 2026-05-19
sources: 0
---

# AI on Invoices — the V2 wedge

The 2026 differentiation column ([[overview]] "AI-assisted") is empty
in the codebase but real in the thesis. This page captures the
specific AI features that — once 2B/2C are shipped — separate
AstraBill from myBillBook and Vyapar, neither of which has any
LLM/ML in their product surface yet.

## Where AI shows up on an invoice

These are not all V2 — some are V1.x once OCR works:

1. **Photograph-to-draft** *(deferred but planned)* — owner snaps a
   handwritten estimate or competitor invoice; OCR + LLM extract
   line items into a draft. The "compose by writing a draft row"
   architecture from [[decision/drafts-and-multi-device]] makes this
   a feature, not a re-platform.

2. **Highlight + suggest while typing**
   - HSN code mismatch — "This product has been billed under HSN
     7003 in 12 prior invoices; you typed 7005. Use 7003?"
   - GST rate sanity — "This customer is in Maharashtra; your
     business is in Delhi. The line items will be billed IGST 18%,
     not CGST 9% + SGST 9%."
   - Rate drift — "₹285/sqm is 12% below your last six sales of
     this product. Confirm or adjust?"
   - Stock alert — "This SKU shows 4 in stock; you're billing 5.
     Continue (a stock adjustment will be recorded) or change qty?"
   - HSN tax-mismatch warning — "GST 12% is unusual for HSN 7003
     (most invoices use 18%). Is this right?"

3. **AI rewrites of T&C / notes**
   - Owner writes: "pay in 30 days or 18% interest"
   - AI suggests: "Payment due within 30 days. Late payments
     attract interest at 18% per annum from the invoice date as
     per Section 73 of the Sale of Goods Act."
   - Owner accepts or keeps theirs. The point is the *option*, not
     the auto-rewrite.

4. **Customer-history summary at create time** — "This is
   Agarwal Distributors' 14th invoice. Average ticket ₹3,400.
   Average payment delay 18 days (3 invoices currently overdue).
   Last bought: glass cutting on 02/05."

5. **Send-time copy suggestion** — when the owner clicks "Send on
   WhatsApp", the AI proposes the WhatsApp message text in the
   owner's voice (learned from prior messages, or templated):
   "Bhaiya, aapka bill bhej raha hu. Total ₹3,715. UPI link niche
   hai, paid kar dijiye." Owner edits or sends.

6. **Voice-to-invoice** — owner says "Agarwal ko 5mm glass 4 piece
   bana do, rate same as last time"; AI fills the form. The
   Indian-shop reality is that owners are on the phone constantly;
   voice in is the next-gen entry.

## Why this is the V2 wedge, not V1

- **V1 must work without AI.** GST + WhatsApp + UPI + udhaar are
  the four daily tasks. AI-gone-wrong on a tax invoice is worse
  than no AI; correctness comes first.
- **AI features compound on a clean data layer.** Phase 2A built
  the schema (products with HSN history, customer billing history,
  stock movements). Each suggestion above is a HogQL-equivalent
  read against that layer. The data is there *now*; the LLM
  prompts and UX land in V2.
- **AI features are non-bind-able to vendor.** Stay
  provider-agnostic from day one ([[decision/code-architecture]]
  "External services behind interfaces"). `ILLMProvider` interface,
  initial implementation against Anthropic (Sonnet 4.6 for the
  suggestion layer; cheaper Haiku for the highlight pass), swap
  later if pricing or quality changes.

## What lands in V1 to make V2 cheap

Nothing extra needed for `1` (drafts already exist) or `4`
(customer history reads against existing rows) or `5` (WhatsApp
send templates land in 2B). `2` needs nothing in V1 either — the
data is already being captured. `3` needs the business-level T&C
in [[decision/phase-2-plan]] (already in scope). `6` needs the
draft layer + a voice transcription provider.

In other words: **the AI layer doesn't change V1 architecture.**
It composes on top.

## Cost & latency budget (sketch)

- Highlight pass on line edit: <300ms, ~200 tokens out, ~$0.0001
  per edit. Free-tier-ok.
- Customer-history summary at create: 1.5s, ~400 tokens out,
  ~$0.0008 per draft. Free-tier-ok if cached per session.
- T&C rewrite: 2s, ~600 tokens out, ~$0.0015. Paid-tier feature.
- Voice-to-invoice: 3-5s incl. transcription (~$0.005 per minute
  audio). Paid-tier feature.

The free tier subsidises light AI to drive habit; paid tier
unlocks the heavier features. This is the inverse of OpenAI's
own pricing logic — and it works because LLM costs have dropped
~10x in the last 18 months and will drop more.

## Status

Concept only. No code, no schema changes, no spend authorisation.
Reopen this page when V1 (2A + 2B + 2C) is shipped and the
roadmap turns toward the AI layer.

## Related Pages

- [[decision/drafts-and-multi-device]] — the architecture that
  makes photograph-to-draft a feature, not a re-platform
- [[decision/code-architecture]] — `ILLMProvider` interface
  pattern, when it's time
- [[overview]] — "AI-assisted (2026 features)" differentiation row
- [[competitor/mybillbook]] + [[competitor/vyapar]] — the
  competitors that have zero AI surface
