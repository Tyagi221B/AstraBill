---
type: synthesis
updated: 2026-05-19
sources: 12
---

# AstraBill — Overview

## What We're Building

AstraBill is a billing software for Indian SMEs. Web app (PWA) first, mobile app later. The tagline candidate: **"It's that simple."**

Target: Indian MSME owner, ₹50L-₹5Cr annual revenue, trading/retail shops first (hardware, glass, building materials), Tier 1+2 cities. First customer: user's brother — a glass + hardware shop owner currently paying ~24k/yr for Tally. See [[customer/hardware-shop-owner]].

## Current Thesis (as of 2026-05-17)

> **AstraBill is the billing software Indian SME owners actually use** — not the one their CA uses. WhatsApp-first, mobile-first, AI-assisted, no training required. Cheaper than Tally. Better than Vyapar.

The positioning: **Tally for your CA; AstraBill for you.**

## The Market in One Paragraph

63 million MSMEs in India. 30 million already on some digital billing. 33 million not yet. Tally controls 70-90% of the MSME accounting market with a 30-year-old desktop product that requires dedicated training and costs 10x the listed price when including training/IT. Vyapar (the mobile challenger) has 1 crore users but broken WhatsApp integration and a serious RBAC privacy hole (salesmen can see profit margins). WhatsApp has 400M Indian users and 98% open rate. Indian SMEs lose ₹10.7 lakh crore/year in delayed payments. Automated WhatsApp reminders collect payments 5x faster. The market is ready.

## Differentiation Stack

| Feature | Tally | Vyapar | myBillBook | KhataBook | AstraBill |
|---------|-------|--------|------------|-----------|-----------|
| Mobile access | ❌ | ✅ | ✅ | ✅ | ✅ |
| WhatsApp invoice (working) | ❌ | ❌ (broken) | Sub-feature | ❌ | ✅ |
| UPI payment link in invoice | ❌ | Partial | Partial | ❌ | ✅ |
| Brand-customizable PDF (logo, color, font) | ❌ | ✅ | ✅ (their wedge) | ❌ | ✅ |
| Themed templates (festive / sector-specific) | ❌ | Some | ✅ | ❌ | 2C.5 |
| Proper RBAC (salesman can't see margin) | Partial | ❌ | ❌ | ❌ | ✅ |
| AI-assisted (2026 features) | ❌ | ❌ | ❌ | ❌ | ✅ |
| No training needed | ❌ | Partial | Partial | ✅ | ✅ |
| PWA / offline | ❌ | Partial | ✅ | ✅ | ✅ |
| Price (annual, 1 user) | ₹5,310 renewal | ~₹5,000 | ₹999–2,499/mo gated | Free/low | ₹4,999 |

## Hero Feature (V1)

**Create invoice → one-tap share via WhatsApp with embedded UPI payment link → customer pays → auto-reconciled.**

That's the complete loop. That's the demo that sells the product.

## Product Decisions Made

All binding decisions live in `DECISIONS.md` at the repo root — the single
source of truth. This page does not restate them (that's how the wiki drifted
into contradiction once). Read `DECISIONS.md` for the stack, auth, V1 scope,
pricing, and integration choices.

## Open Questions (Prioritized)

1. **CA partnership**: How to get CAs to recommend AstraBill to their clients?
2. **Marketing**: What's the first content/distribution channel?
3. **Razorpay KYC friction**: Onboarding flow for users who can't collect payments until KYC clears.
4. **Barcode scanning**: V1.1 — mobile camera scanning for fast product lookup.

(Resolved: vertical focus → trading/retail shops first; inventory → in V1;
GST filing → V2. See `DECISIONS.md`.)

## Thesis Evolution

- **2026-05-17**: Thesis formed after first major research pass. Market validated. Differentiation identified. Tally education gap confirmed. Marketing identified as the real moat.
- **2026-05-18**: Phase 2A shipped — customers + products catalogues, the invoice-anatomy migration (dual-unit lines, ship-to, extra charges, transport, e-way), FY-aware invoice numbering, and stock movement on finalise. The build now turns to Phase 2B, the WhatsApp hero loop. Thesis unchanged; this is execution.
- **2026-05-19**: Frontend app pass (F3) shipped — shadcn/ui adopted (non-destructive merge), five hand-rolled v4 primitives (Input/Label/Textarea/Card/Badge), `AppShell` deduping chrome across every authed page, welcoming `/sign-in`, every app page off inline styles and on the token system. Phase 2B (WhatsApp hero loop) starts from a frontend foundation that no longer fights the build.
- **2026-05-19**: myBillBook competitor ingest changed the build order. Their landing leads with "Your bill, Your Brand: Color · Logo · Font · And More!" — brand-customizable invoices are the category's #1 paid-tier upsell, not vanity. AstraBill's PDF is currently one generic template; that's the trust gap that loses Day-1 signups. New phase **2C (Invoice Design System)** scoped — template engine, brand fields on businesses, Cloudinary logo upload, two V1 templates (Modern · Classic; Thermal 80mm deferred to 2C.5), customization UI. **2C lands before 2B** because 2B has external blockers (Meta WABA + Razorpay KYC) and its hero artifact is the PDF this work makes worth sending. [[decision/invoice-design-system]] + [[competitor/mybillbook]].
- **2026-05-19**: Phase **2C-1 shipped complete** — both V1 invoice templates (Modern · Classic), all four embedded fonts, Cloudinary logo upload, and `/settings/branding` with a live preview. An invoice now downloads as a branded PDF and an owner can make it look like their shop's invoice. The brand-customizable-PDF gap vs myBillBook is closed; remaining 2C work is all 2C.5 (festive templates, thermal-80, pharma columns). Build turns to **Phase 2B**, the WhatsApp hero loop. Thesis unchanged; execution.
- **2026-05-19**: Mid-2B WhatsApp work surfaced a deeper gap — the app *shell* still felt like AstraBill, not the owner's billing dashboard. 2C made the PDF theirs; the chrome lagged. Scoped **Phase 2D — White-label App Shell**: path-based `/b/[businessId]/...` routing, branded sidebar (subtle: brand colour on the active nav edge + avatar, never the whole sidebar), smart `/dashboard` redirect, BusinessSwitcher dropdown, "Powered by AstraBill" quietly at the foot. **Step 1 shipped today** — layout + sidebar + dashboard placeholder + routing scaffold. Steps 2–4 (page migrations · real KPIs · mobile) queued. 2D lands before 2B's send-button work because every later feature (payment recording, WhatsApp send) is a panel/button that wants a stable URL shape to live in. [[decision/white-label-app-shell]].
- **2026-05-19**: **2D Step 2 shipped** — invoices, customers, products, settings/branding all migrated under `/b/[businessId]/...`; every authed page now in the branded shell. Then a deliberate detour: customers + products were a working CRUD, but the *reporting* layer (customer udhaar, dashboard KPIs) was missing and gated on a primitive that didn't exist — nothing was ever marked paid. **Payment recording shipped** — manual cash/UPI/cheque payments against an invoice; `amount_paid` derived from payment rows, status (paid / partially_paid / sent) follows the sum, voids are soft-deletes. This is the V1 udhaar keystone — it makes real "outstanding" numbers possible, unblocking 2D Step 3 (dashboard KPIs) and the customer udhaar view. [[decision/payment-recording]].

## Related Pages

- [[decision/market-validation]] — full market validation case
- [[competitor/tally]] — the incumbent to displace
- [[competitor/vyapar]] — the mobile competitor to beat
- [[concept/whatsapp-billing-opportunity]] — our biggest wedge
- [[concept/gst-compliance]] — the compliance forcing function
- [[concept/pricing-model]] — where we sit in the market
- [[concept/india-sme-market]] — full market context
