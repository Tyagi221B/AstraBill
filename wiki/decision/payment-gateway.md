---
type: decision
updated: 2026-05-21
sources: 3
status: superseded
---

> **Superseded for V1 by [[decision/upi-deep-links]] on 2026-05-21.**
> V1 ships UPI deep links to the shop's own VPA — no gateway, no webhook, no
> `IPaymentProvider` abstraction. Razorpay is deferred to V1.x and, when it
> lands, will be **per-merchant credentials** (each business connects their
> own Razorpay), not platform-shared. The reasoning below remains valid
> *for the V1.x reintroduction* — read it as background, not current plan.

# Payment Gateway — Razorpay vs Alternatives

## Decision: Use Razorpay. Abstract the layer.

**Short answer**: Razorpay is the right choice at launch. But we architect the payment layer as an abstraction (a `PaymentProvider` interface) so we can swap or add Cashfree/PhonePe later without touching invoice logic.

## Why Razorpay

| Factor | Razorpay | Cashfree | PhonePe PG |
|--------|----------|----------|------------|
| API quality / docs | Best in class | Good | Functional |
| UPI conversion rate | Highest in India | High | Highest (own user base) |
| Smart Collect (auto-reconcile) | ✅ Yes (2.0) | Partial | ❌ |
| Payment Links API | ✅ Full | ✅ | Limited |
| Settlement speed | T+2 (T+1 paid) | T+1 | T+1 |
| Transaction fee | ~2% | 1.85% | 0% for SMEs (2025) |
| Integration effort | Lowest | Medium | Medium |
| Brand trust for SMEs | Highest | Growing | Growing |

Cashfree is 0.15% cheaper per transaction. At ₹10L/month volume = saves ₹1,500/month. Worth switching at scale, not at launch.

## The Smart Collect Feature = AstraBill's Super Power

Razorpay **Smart Collect 2.0** is exactly what we need for udhaar collection:

1. We generate a **Virtual UPI ID** per customer invoice (e.g., `astrabill.INV-00234@razorpay`)
2. Shop owner shares invoice on WhatsApp with that UPI ID embedded as a payment link
3. Contractor pays → money hits Razorpay → **auto-reconciled to that specific invoice** → invoice marked paid
4. Shop owner gets notification instantly — no manual reconciliation

This eliminates the biggest pain: "Did Ramesh pay the INV-00234 or the INV-00187?" — it's auto-matched.

## What Razorpay Charges

- UPI: **0% MDR** (free — mandated by NPCI)
- Cards / Net Banking / Wallets: ~2% + GST
- Payment Links: ~2% per successful collection
- Smart Collect: subscription-based (negotiate at scale)

For V1, most collections will be UPI = ₹0 per transaction for us and the user. This is a free collection infrastructure.

## What We Build

```
Invoice created in AstraBill
     ↓
Payment button on invoice → Razorpay Payment Link OR Virtual UPI ID
     ↓
WhatsApp message with link + QR code
     ↓
Customer pays via any UPI app (GPay, PhonePe, Paytm)
     ↓
Razorpay webhook → our backend → invoice marked PAID
     ↓
Auto receipt to customer via WhatsApp
     ↓
Shop owner sees PAID status in dashboard
```

## What We Don't Do

- Don't build our own payment collection
- Don't become a payment gateway (massive regulatory overhead — PA/PG license)
- Don't route money through our platform (escrow/nodal account = PPI license)
- We just generate Razorpay payment links — money goes Razorpay → merchant's bank account directly

## Abstraction Architecture (Important)

```typescript
interface PaymentProvider {
  createPaymentLink(invoice: Invoice): Promise<PaymentLink>
  createVirtualUPI(customer: Customer): Promise<VirtualUPI>
  handleWebhook(payload: WebhookPayload): Promise<void>
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>
}

class RazorpayProvider implements PaymentProvider { ... }
class CashfreeProvider implements PaymentProvider { ... }  // add later
```

This costs 2 extra hours at implementation, saves a painful migration later.

## Related Pages

- [[concept/whatsapp-billing-opportunity]] — payment link goes into WhatsApp message
- [[decision/onboarding-flow]] — payment collection triggers upsell to paid plan
- [[customer/hardware-shop-owner]] — udhaar collection is the main use case
