---
type: decision
updated: 2026-05-17
sources: 2
---

# Onboarding Flow — No Signup First

## Decision: Anonymous → Phone OTP → Paid. No email/password wall upfront.

The user's instinct is correct. Most billing apps lose 60-70% of potential users at the signup wall before the person has ever seen the product. We flip this.

## The Flow

```
Landing page: "Create your first invoice — no account needed"
     ↓
User fills: business name, customer name, items, amounts → DONE
     ↓
Invoice preview rendered (full quality, no watermark teaser)
     ↓
Two CTAs:
  [Download PDF — one time]       [Send via WhatsApp →]
                                          ↓
                              "Enter your phone number to send"
                              (OTP in 30 seconds)
                                          ↓
                              Phone verified = free account created
                              Invoice saved, sent via WhatsApp
                                          ↓
                              They're in. Dashboard shows their 1 invoice.
                              Nudge: "Track if Ramesh has paid →"
```

## Why Phone, Not Email

- India is phone-first. SME owners think in phone numbers not email addresses.
- OTP via WhatsApp = zero friction. No password to create. No email to remember. (Channel decision: [[decision/auth-strategy]].)
- Phone = identity in India. Their customers know them by phone.

## What Anonymous Users Get (No Account)

- Create one invoice
- Preview it fully
- Download PDF once

That's it. No save. No history. No share via WhatsApp. This creates natural pull to verify.

## What Free Accounts Get (Phone Verified)

- Save unlimited drafts
- **20 invoices/month** (GST compliant PDF)
- Udhaar ledger (who owes me) — basic
- Download PDFs
- Share via direct link (not WhatsApp automation)

## What Paid Subscribers Get

| Feature | Free | Starter ₹499/mo | Pro ₹999/mo |
|---------|------|----------------|-------------|
| Invoices/month | 20 | Unlimited | Unlimited |
| WhatsApp invoice send | ❌ | ✅ | ✅ |
| Auto payment reminders | ❌ | ❌ | ✅ |
| Udhaar tracking + alerts | Basic | Full | Full |
| Multi-user / RBAC | ❌ | ❌ | ✅ |
| Inventory tracking | ❌ | Basic | Full |
| GST reports (GSTR-1 ready) | ❌ | ✅ | ✅ |
| UPI payment links in invoice | ❌ | ✅ | ✅ |
| Custom invoice template | ❌ | ✅ | ✅ |

## The Conversion Triggers (When Free → Paid)

Don't show a paywall. Show what they're missing at the exact moment they want it:

1. **"Send via WhatsApp"** button → "Upgrade to send invoices directly via WhatsApp" (most powerful)
2. **Udhaar ledger** → "Set up auto-reminder for Ramesh (₹45,000 pending)" → upgrade to Pro
3. **21st invoice** → "You've created 20 invoices this month. Upgrade for unlimited."
4. **Multi-user** → "Add your accountant to AstraBill" → Pro

The triggers are contextual, not annoying modals.

## System Design for Feature Gating

This is important — gate at the service layer, not the UI layer:

```typescript
// FeatureFlag service — check before any gated operation
const canSendWhatsApp = await features.check(user, 'whatsapp_send')
// Returns: { allowed: boolean, reason?: string, upgradePlan?: Plan }

// The UI reads the same service — no duplication
// If not allowed → show upgrade nudge inline, not a modal
```

- Feature flags stored in DB against user's plan
- Plan changes → flags update immediately (no cache issues)
- Free tier limits enforced server-side (client can't bypass)
- All limits are soft-enforced: we tell them, don't block them abruptly

## What We Learn From This Flow

- **Activation rate**: % who create invoice without account (expect 60-70%)
- **Conversion to phone-verified**: % who then enter phone number (expect 40-50% of those)
- **Conversion to paid**: % who upgrade within 30 days (target: 8-12%)
- This funnel tells us what's working and where to optimize

## The Canva Precedent

Canva built a $40B company starting with "create without signup." The pattern works when:
1. The core action (create invoice) is valuable immediately
2. The save/share requires identity (natural upsell)
3. The product is simple enough to understand without tutorial

AstraBill hits all three. We do this.

## Related Pages

- [[concept/pricing-model]] — the plan tiers
- [[decision/payment-gateway]] — UPI payment links are the paid-tier hook
- [[customer/hardware-shop-owner]] — udhaar alert = the strongest upgrade trigger
