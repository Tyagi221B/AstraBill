---
type: decision
updated: 2026-05-21
sources: 2
---

# UPI Deep Links — V1 Payment Mechanism (Razorpay Deferred)

> Binding facts live in [DECISIONS.md](../../DECISIONS.md) — Integrations →
> Payments (V1) and Payments (V1.x). This page holds the rationale only.

## The decision

For V1, AstraBill collects payments via **UPI deep links** to the shop owner's
own VPA. No gateway. No webhook. No `IPaymentProvider` interface yet. Razorpay
is deferred to V1.x and, when it lands, will be **per-merchant credentials** —
never platform-shared.

## Why we changed direction (the planning conversation)

The original plan ([[decision/payment-gateway]]) said Razorpay with Smart
Collect + Payment Links, with a clean `IPaymentProvider` abstraction so
Cashfree/PhonePe could swap in later. That plan held for months. It broke under
two questions the day we sat down to actually build it:

1. **Whose Razorpay account holds the money during pilot?**
   - *Platform-shared* (one AstraBill key for everyone): money flows through
     Opryon's Razorpay → Opryon's bank → manually transferred to the shop owner.
     That makes Opryon the merchant of record. The DECISIONS line `"becoming a
     payment gateway / routing money"` explicitly forbids this. PA/PG license
     territory. Your books absorb their revenue. Doesn't scale past customer #1.
   - *Per-merchant connected* (each shop has their own Razorpay account): the
     architecturally correct answer, but requires every shop to onboard with
     Razorpay (KYC, business proof, bank linking) **before they can take their
     first payment**. That's the exact friction we set out to remove.
2. **What do we actually save the shop owner?**
   - Razorpay's UPI MDR is 0% (NPCI mandate). The non-UPI methods are 2%.
   - Real-world: 95% of Indian SME collections happen on UPI today. Cards are
     vanishingly rare in this segment.
   - So the gateway's value is **auto-reconciliation**, not the rails. And we
     can ship that as a V1.x upsell once the loop is real.

The UPI deep link approach side-steps all of it: the shop's VPA is their own,
already KYC'd by their bank, ready to receive. We just render the link.

## How it works

The deep link is a single URL string defined by NPCI:

```
upi://pay?pa=<vpa>&pn=<payee-name>&am=<amount>&tn=<note>&cu=INR
```

| Param | Maps to | Notes |
|-------|---------|-------|
| `pa`  | `businesses.upi_id` | The shop's VPA, set once in settings. URL-safe. |
| `pn`  | `businesses.name`   | URL-encoded. Spaces → `%20`. |
| `am`  | `invoices.total`    | Exact decimal string from DB. No rounding. |
| `tn`  | `invoices.number`   | **Slashes → hyphens** for the deep-link only (some apps mangle `%2F`). `INV/26-27/0042` becomes `INV-26-27-0042`. Display stays unchanged. |
| `cu`  | `"INR"`             | Hardcoded — UPI today is single-currency. |

A QR code rendered from the **same string** is the iOS / desktop fallback.

The customer flow:

1. WhatsApp → "View Invoice" → AstraBill share page (sees invoice, brand)
2. Taps "**Pay ₹X via UPI**" → Android OS picks UPI app → app opens
   pre-filled with payee, amount, note → enters PIN → done
3. Money goes customer's bank → shop's bank, peer-to-peer. NPCI handles it.
4. Both parties get SMS confirmation from their banks.

The shop owner sees the bank SMS and records the payment in AstraBill via
the existing `Record payment` flow ([[decision/payment-recording]]).

## What we explicitly give up

- **Auto-reconciliation.** No webhook. The shop owner reconciles manually
  from their bank SMS — exactly what they did before AstraBill, except now
  there's a place to record it with full history. This is V1.x value to add,
  not V1 blocker.
- **Card / NetBanking / Wallets.** UPI only. Acceptable for the target
  customer (trading shops collecting from contractors who already pay via
  UPI for everything).
- **The `IPaymentProvider` abstraction.** Premature without a provider behind
  it. Will be introduced the day a real provider is needed.

## What we did NOT give up

- The schema (`payments.razorpay_payment_id`, `razorpay_order_id` columns
  exist from day one) — they sit unused for V1, ready for V1.x.
- The `payments` table itself + the full audit / status / partial-payment
  machinery ([[decision/payment-recording]]).
- The decision to **never** become a payment gateway (this reinforces it).

## The customer-can-edit-the-amount caveat

With a personal/unregistered VPA (which `businesses.upi_id` is), some UPI
apps (GPay, PhonePe) pre-fill the amount but **let the customer edit it**.
A customer could theoretically pay ₹425 instead of ₹4,250 — typo or fraud.

This is not a new problem. The shop owner sees the actual received amount
in their bank SMS, records that exact amount, and the invoice flips to
`partially_paid` automatically (the status math from `payments.ts` handles
this). Same risk profile as cash payment.

If/when we move to Razorpay per-merchant in V1.x, the VPA becomes a
registered merchant VPA and the amount is locked — that's a real upgrade,
not a V1 must.

## Why per-merchant Razorpay (when it lands) — and not platform-shared

A second pass at the question, written down so it doesn't get re-litigated:

| Concern | Platform-shared | Per-merchant |
|---|---|---|
| AstraBill = merchant of record? | Yes (illegal without PA license at scale) | No (each shop is their own merchant) |
| Money flows through Opryon's books? | Yes (revenue recognition nightmare) | No (Razorpay → shop's bank directly) |
| Scales past customer #1? | No | Yes |
| Refunds? | Opryon issues them (operational burden) | Shop handles via their own dashboard |
| Friction at onboarding? | Zero | Razorpay KYC per shop |

Platform-shared is only ever the right answer in a marketplace context
(Stripe Connect, Razorpay Route) where the platform genuinely sits in the
flow of funds — which is exactly the PA license posture we said we wouldn't
take. So it's never the right answer for AstraBill.

## Files this decision touches

- `lib/db/schema.ts` — `businesses.upi_id` already exists (no migration)
- `app/i/[shareToken]/page.tsx` — Pay button + QR (this work)
- `app/b/[businessId]/settings/branding/` — VPA already editable; add regex validation
- `lib/services/invoice-pdf.ts` (+ the Puppeteer microservice) — QR in PDF footer

## Related

- [[decision/payment-gateway]] — the original Razorpay-V1 plan (superseded)
- [[decision/payment-recording]] — the manual reconciliation flow we lean on
- [[decision/public-invoice-share]] — the `/i/[shareToken]` page the Pay button lives on
- [[customer/hardware-shop-owner]] — your brother's actual collection workflow
