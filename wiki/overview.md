---
type: synthesis
updated: 2026-05-17
sources: 12
---

# AstraBill — Overview

## What We're Building

AstraBill is a billing software for Indian SMEs. Web app (PWA) first, mobile app later. The tagline candidate: **"It's that simple."**

Target: Indian MSME owner, ₹1Cr-₹10Cr annual revenue, service businesses first, Tier 1+2 cities. First customer: user's brother (MSME owner currently paying ~24k/yr for Tally).

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

- **Tech stack**: Next.js (v16), Supabase, PWA-first
- **Auth**: NextAuth with RBAC (learned from TheGympilot)
- **Mobile**: PWA first, native app later
- **Notifications**: In-app push notifications (PWA) — avoid WhatsApp cost for internal notifications
- **Payments**: Razorpay or similar for UPI collection
- **WhatsApp**: Meta Cloud API directly or via BSP for invoice delivery

## Open Questions (Prioritized)

1. **Vertical focus**: Service businesses (B2B invoicing) OR retail/kirana (POS + inventory)? — choose one to start
2. **Inventory**: Include in V1 or keep billing-only for speed to market?
3. **GST filing**: Auto-prepare GSTR reports in V1 or later?
4. **CA partnership**: How to get CAs to recommend AstraBill to their clients?
5. **Marketing**: What's the first content/distribution channel?

## Thesis Evolution

- **2026-05-17**: Thesis formed after first major research pass. Market validated. Differentiation identified. Tally education gap confirmed. Marketing identified as the real moat.

## Related Pages

- [[decision/market-validation]] — full market validation case
- [[competitor/tally]] — the incumbent to displace
- [[competitor/vyapar]] — the mobile competitor to beat
- [[concept/whatsapp-billing-opportunity]] — our biggest wedge
- [[concept/gst-compliance]] — the compliance forcing function
- [[concept/pricing-model]] — where we sit in the market
- [[concept/india-sme-market]] — full market context
