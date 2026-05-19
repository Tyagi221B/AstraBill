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

| Feature | Tally | Vyapar | KhataBook | AstraBill |
|---------|-------|--------|-----------|-----------|
| Mobile access | ❌ | ✅ | ✅ | ✅ |
| WhatsApp invoice (working) | ❌ | ❌ (broken) | ❌ | ✅ |
| UPI payment link in invoice | ❌ | Partial | ❌ | ✅ |
| Proper RBAC (salesman can't see margin) | Partial | ❌ | ❌ | ✅ |
| AI-assisted (2026 features) | ❌ | ❌ | ❌ | ✅ |
| No training needed | ❌ | Partial | ✅ | ✅ |
| PWA / offline | ❌ | Partial | ✅ | ✅ |
| Price (annual, 1 user) | ₹5,310 renewal | ~₹5,000 | Free/low | ₹4,999 |

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

## Related Pages

- [[decision/market-validation]] — full market validation case
- [[competitor/tally]] — the incumbent to displace
- [[competitor/vyapar]] — the mobile competitor to beat
- [[concept/whatsapp-billing-opportunity]] — our biggest wedge
- [[concept/gst-compliance]] — the compliance forcing function
- [[concept/pricing-model]] — where we sit in the market
- [[concept/india-sme-market]] — full market context
