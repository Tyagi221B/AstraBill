---
type: concept
updated: 2026-05-17
sources: 3
---

# Pricing Model — What to Charge

## Competitor Pricing Landscape

| Product | Pricing |
|---------|---------|
| Tally Silver (lifetime) | ₹22,500 + GST one-time, ₹4,500/yr renewal |
| KhataBook | Free (ledger), paid for advanced |
| Vyapar | ~₹400-600/month |
| Zoho Books Standard | ₹899/month |
| Refrens | ₹1,600/month |
| Odoo Enterprise | ₹800-₹2,000/user/month + ₹3-25L implementation |
| Razorpay Invoices | 2% per transaction |

## Indian SME Price Sensitivity

- 60-70% lower willingness to pay than Western markets
- Tier 2/3 SMBs (our primary market): **70-80% below US pricing**
- First-time software buyers expect annual billing, not monthly
- Annual billing preferred (one decision per year vs monthly churn)
- "Free forever core, pay for power features" resonates strongly

## Sweet Spot for AstraBill

Based on competitor pricing and willingness to pay:

| Plan | Price | Target |
|------|-------|--------|
| **Free** | ₹0 | Solo businesses, first-time users, 20 invoices/month, no WhatsApp send |
| **Starter** | ₹499/month (₹4,999/year) | Small businesses, WhatsApp invoicing (200 sends/month included) |
| **Pro** | ₹999/month (₹9,999/year) | Growing businesses, full WhatsApp automation (1,000 sends/month), multi-user |
| **Business** | ₹1,999/month (₹19,999/year) | Multi-location, advanced inventory, team RBAC, unlimited sends |

**WhatsApp fair-use cap**: Each plan includes a monthly WhatsApp send allowance. Above the cap: ₹0.20/message (our Meta cost ₹0.14 + ₹0.06 margin). Never surprise the user — show usage in dashboard.

**Rationale:**
- Free creates acquisition funnel
- ₹499 < ₹4,500 Tally renewal (annual equivalent ₹4,999 = cheaper than Tally's TSS alone)
- ₹999 competes directly with Vyapar but with better WhatsApp + RBAC
- Annual billing: "less than ₹1,000/month" framing works

## The "Pay Only When Transacting" Alternative

Razorpay's model: **2% per transaction**. Works for very small businesses with unpredictable volume. Could be an alternative free tier: 0% subscription + X% per paid invoice (when collecting via UPI). This aligns revenue with customer success.

## What NOT to Do

- Don't price per user at first — Indian SMEs will try to share logins instead of upgrading
- Don't require annual commitment upfront — too much friction for first-time buyers
- Don't charge for WhatsApp messages directly — pass through the ₹0.14 Meta cost and build it into the plan

## The Tally Replacement Angle

For businesses already paying Tally:
- Tally Silver lifetime: ₹26,550 + ₹5,310/yr renewal = ~₹32K first year, ₹5.3K subsequent
- AstraBill Pro: ₹9,999/year = **cheaper than Tally renewal + more features + mobile**
- Positioning: "Switch from Tally, save money, get mobile access"

## Related Pages

- [[concept/india-sme-market]] — price sensitivity by tier
- [[competitor/tally]] — the anchor price to beat
- [[competitor/vyapar]] — the direct price competitor
