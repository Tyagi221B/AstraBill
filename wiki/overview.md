---
type: synthesis
updated: 2026-05-21
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
3. **Auto-reconciliation (V1.x)**: when to introduce per-merchant Razorpay so shops get automatic payment matching on top of the UPI deep-link flow.
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
- **2026-05-19**: **2D Step 3 shipped** — the dashboard's placeholder cards became real figures: outstanding ₹ (the udhaar headline), paid this month, revenue this month, recent invoices, low-stock alerts. With payment recording underneath, the owner now opens the app to a true picture of where the business stands. 2D is Steps 1–3 done; only the mobile shell remains.
- **2026-05-19**: **Customer detail / udhaar tracker shipped** — `/b/[businessId]/customers/[id]`: per-customer billed / paid / outstanding + full invoice history. This is V1 feature #3 (the udhaar tracker), seller side — "what does Ramesh Traders owe me" now has an answer screen.
- **2026-05-19**: **Phase 2D complete** — Step 4 (mobile shell) shipped: a hamburger + slide-in drawer below the `md` breakpoint, sharing the sidebar body with the desktop `<aside>`. The app is now navigable and branded on every screen size — which matters, the thesis is mobile-first. With 2D done and three of four V1 features real (GST invoice + PDF · udhaar · inventory), the build turns to **Phase 2B** — the WhatsApp hero loop, the one V1 feature left and the demo the product is built to sell.
- **2026-05-19**: **Phase 2B kicked off** — two Meta utility templates submitted (`astrabill_invoice` + `astrabill_payment_reminder`, ≈3h review ETA), both with a dynamic URL button pointing at `https://www.astrabill.com/i/{{1}}`. The template button URL locks the public-view path in stone, so the **public invoice share infrastructure shipped first**: `share_token` on invoices (16-char base64url, generated at finalise), the auth-free `/i/[shareToken]` page (mobile-first, brand-coloured), and `/api/i/[shareToken]/pdf` for download. The token IS the auth — same model as Stripe/Razorpay receipt links. Once Meta approves, only the send code + "Send on WhatsApp" button remain. [[decision/public-invoice-share]].
- **2026-05-19**: **Phase 2B — WhatsApp send shipped.** `astrabill_invoice` came back approved (~3h SLA, as promised). Built the full send loop on top: `whatsapp_messages` repository (immutable history, no soft-delete), `lib/services/whatsapp-send.ts` (membership + permission + finalised + has-phone guards, lazy share_token backfill for pre-2B invoices, transport-layer whitespace sanitisation against Meta's #131008), thin `POST /api/invoices/[id]/send-whatsapp` route, and `WhatsAppPanel` card on the invoice detail page with send/resend, masked phone, and the full send history list. Inline-status UX matches `PaymentPanel`; no toast library introduced for one feature. The hero loop (create → finalise → Send on WhatsApp → customer sees PDF + share link) is now end-to-end. `astrabill_payment_reminder` still in review; not blocking. The Razorpay leg of 2B is what remains. [[decision/whatsapp-invoice-send]].
- **2026-05-20**: **WhatsApp URL fix — `astrabill_invoice_v1`.** The first real test send exposed a Meta gotcha: URL buttons **append** the variable to a static base, they don't *substitute* `{{1}}`. The v0 template had `{{1}}` typed into the URL field, so Meta kept it literal and appended the token after — producing `https://www.astrabill.com/i/{{1}}<token>`. Approved templates can't have URL fields edited, so the v0 was abandoned and `astrabill_invoice_v1` submitted with the correct base URL (`https://www.astrabill.com/i/`, no `{{1}}`). Code, DECISIONS.md, and the rationale pages corrected to reflect "append, not substitute". Template in review again; retest once Active.
- **2026-05-20**: **Phase 2B end-to-end on production.** `astrabill_invoice_v1` came back Approved (Active - Quality). The AstraBill phone number `+91 87553 48646` was registered with the Cloud API (`POST /{phone-number-id}/register` with a fresh 6-digit PIN, saved to `.env.local`). 9 commits pushed to `origin/main` — the entire 2D + 2B + URL-fix stack went out in one Vercel deploy. Public `/i/[shareToken]` + `/api/i/[shareToken]/pdf` verified on `astrabill.com`: a freshly-sent invoice's "View invoice" button resolves to the clean URL and the public page renders the real invoice (brand colour, line items, GST breakdown, totals). **4 of 4 V1 features are now real on prod** — GST invoice + PDF · WhatsApp send · udhaar · inventory. Razorpay is the only V1 piece left. DECISIONS.md gained an "Environments" row codifying that dev (`.env.local`) and prod (Vercel) point at the same Supabase project for now — operational reality with required discipline ([[decision/infrastructure]]). AstraBill display name "AstraBill by Opryon Labs" still pending Meta approval; sends temporarily branded as GymPilot until that clears (cosmetic only). UI refinement pass is the next focus before any external customer beyond the user's brother's shop.
- **2026-05-20**: **Phase 2E complete — all four steps live on production.** Triggered by the user's reaction after 2B went live ("looks shit right now"), 2E was scoped as a 2–3 day visual-polish pass with an explicit Zoho-like target (light, calm, generous spacing). Step 0 laid the warm-paper palette (`#FAFAF7` page · `#FFFFFF` cards · refined indigo `#1E40AF` primary), flipped `defaultTheme` to `"light"`, and documented the spacing + typography scales in `globals.css`. Step 1 rebuilt the invoice create form to match myBillBook layout-for-layout (Bill To + Invoice details split, full-width line items, accordions + totals bottom split, sticky-top action bar on desktop, sticky-bottom save on mobile, "+ dual-unit billing" toggle gating only the 2nd-qty pair). Step 2 propagated the patterns — most visibly the invoice detail page, where the orphan Totals card now lives in the same 2-col rhythm as the form. Step 3 landed the polish list: `EmptyState` primitive (icon + headline + CTA, Card-wrapped) wired across /invoices /customers /products; `sonner` mounted once at root with `richColors` + `closeButton`, replacing six inline destructive-banner patterns across InvoiceForm · CustomerForm · ProductForm · InvoiceActions · WhatsAppPanel · PaymentPanel with `toast.error()` calls; `Skeleton` primitive + `loading.tsx` shells on the three highest-traffic server pages (dashboard, invoices list, invoice detail); a single `a:focus-visible` rule in globals.css that gives inline anchors a keyboard-only ring at `--ring` with 2px offset. Build turns next to **Razorpay** — the last V1 piece, now arriving into a polished surface so its "Pay Now" button inherits the discipline instead of fighting it. [[decision/ui-refinement-phase-2e]].
- **2026-05-21**: **Razorpay deferred for V1 — UPI deep links instead.** The day we sat down to build the Razorpay leg, two questions broke the plan: (1) *whose account holds the money during pilot* — platform-shared makes Opryon the merchant of record (PA license territory, books absorb the shop's revenue, doesn't scale past customer #1, violates the standing `"never become a payment gateway"` decision), per-merchant connected is correct but adds Razorpay KYC friction at every shop's onboarding; and (2) *what does the gateway buy us* — UPI MDR is 0% (NPCI), 95% of Indian SME collections are UPI today, so the gateway's real value is auto-reconciliation, not the rails. The pivot: ship NPCI's standard `upi://pay?...` deep link to the shop's own VPA (`businesses.upi_id` already exists on the schema) as a "Pay ₹X via UPI" button + QR code on the public share page and the invoice PDF. Money flows customer's bank → shop's bank, peer-to-peer; AstraBill never touches it. Reconciliation is manual via the existing `Record payment` flow — exactly what the shop did before AstraBill, except now there's a place to record it with full history. Auto-reconcile becomes a V1.x upsell (per-merchant Razorpay, never platform-shared). The schema's `payments.razorpay_payment_id` / `razorpay_order_id` columns sit unused, ready for that future. No `IPaymentProvider` interface written speculatively — it lands the day a real provider does. [[decision/upi-deep-links]]; [[decision/payment-gateway]] superseded for V1.

## Related Pages

- [[decision/market-validation]] — full market validation case
- [[competitor/tally]] — the incumbent to displace
- [[competitor/vyapar]] — the mobile competitor to beat
- [[concept/whatsapp-billing-opportunity]] — our biggest wedge
- [[concept/gst-compliance]] — the compliance forcing function
- [[concept/pricing-model]] — where we sit in the market
- [[concept/india-sme-market]] — full market context
