---
type: decision
updated: 2026-05-19
sources: 1
---

# Phase 2 Plan — the WhatsApp Hero Loop

The build blueprint after Phase 1. Read alongside `DECISIONS.md`. Binding
facts live in `DECISIONS.md`; this page holds the *how*, the *sequence*, and
the *why*.

## Phase 2A — shipped

Customers and products catalogues, the invoice-anatomy migration, FY-aware
invoice numbering, the extra-charge GST math, and stock movement on finalise
all landed (commits `1496cc7`, `944adf4`). The vitest correctness gate for
`lib/gst.ts` went in alongside.

What's binding from that work lives in `DECISIONS.md` — see "Product —
Invoice Anatomy", "Invoice numbering", and "Custom invoice prefix". The build
itself is in git history. This page does not restate any of it; two rationale
notes are kept here because they are *why*, not *what*:

- **Why the number is assigned at finalise, not create.** A draft is not a
  legally issued document — it must not consume an invoice number. Assigning
  at finalise lets the sequence count only finalised rows, so the issued
  series stays gap-free (GST Rule 46 expects gap-free per-FY numbering) and an
  abandoned draft costs nothing. The consequence — drafts carry a NULL number
  — is recorded in `DECISIONS.md`.
- **Why a custom prefix is tax-invoice-only.** The sequence resets per type,
  so a prefix shared across types would let a tax invoice and an estimate
  resolve to the same `{prefix}/{FY}/{seq}` string and collide on the unique
  index. Non-tax types keep their built-in prefixes; collision becomes
  impossible rather than merely unlikely.

What 2A did **not** include, and 2B/2C pick up: PDF generation,
brand-customizable invoice templates, WhatsApp send, payments.

## Phase 2C — Invoice Design System  (lands *before* 2B)

The competitor ingest on 2026-05-19 ([[competitor/mybillbook]]) made
clear that brand-customizable invoices are the category's #1 paid-tier
upsell. AstraBill's PDF is currently one generic template — a Day-1
trust gap. 2C closes it: template engine + brand fields + Cloudinary
logo upload + customization UI + two V1 templates (Modern · Classic;
Thermal 80mm deferred to 2C.5). LLD lives in
[[decision/invoice-design-system]].

**Why 2C precedes 2B:** 2B has external blockers (Meta WABA + Razorpay
KYC, both multi-week). 2C is unblocked codebase + Cloudinary work.
2B's hero artifact is the PDF; 2C makes that PDF worth sending.

## Phase 2D — White-label App Shell  (inserted before 2B)

2C made the *PDF* feel like the owner's; the *app shell* still felt
like AstraBill's — business-picker `/dashboard`, `?businessId=` URLs,
generic header. Mid-2B work surfaced this as the actual blocker: every
2B feature is a button/panel that wants a stable URL shape and a
branded chrome to live in. Detailed LLD:
[[decision/white-label-app-shell]].

Four steps. Steps 1–3 shipped 2026-05-19; only the mobile shell remains.

1. **Foundation** *(shipped)* — `/b/[businessId]/` layout doing the
   one membership check, `BrandedAppShell` + `Sidebar` with the
   BusinessSwitcher, smart `/dashboard` redirect, dashboard
   placeholder, `lib/routes.ts` SSOT.
2. **Page migration** *(shipped)* — `/invoices`, `/customers`,
   `/products`, `/settings/branding` migrated under
   `/b/[businessId]/...`; every authed page now in the branded shell.
3. **Real dashboard KPIs** *(shipped)* — outstanding ₹, paid this
   month, revenue this month, recent invoices, low stock — replacing
   Step 1's placeholder cards.
4. **Mobile shell** — hamburger / drawer; current shell is `md:` and up.

**Mid-2D detour — payment recording** *(shipped 2026-05-19)*. Steps 3
+ the customer-udhaar view both need real paid/unpaid numbers, and
nothing was ever marked paid. Manual payment recording was built as
the prerequisite — see [[decision/payment-recording]]. Step 3's KPIs
become real with it in place.

## Phase 2B — WhatsApp Send + UPI  (the hero loop)

Three parts. Detailed LLD lands when each is started.

1. **PDF microservice** — separate Node + Express + Puppeteer service on
   Digital Ocean ([[decision/pdf-generation]]). Renders the invoice HTML →
   PDF → uploads to Cloudinary → returns the URL. AstraBill calls it via
   `PDF_SERVICE_URL`. Includes designing the actual invoice template —
   modern, mobile-readable, 2026-grade (not a carbon-copy clone). The
   template renders the HSN tax summary and amount-in-words (both derived at
   render time — see `DECISIONS.md`).
2. **WhatsApp invoice send** — `astrabill_invoice_v1` template (PDF document
   header + payment-link button), sent through the BullMQ queue on the DO
   worker ([[decision/notifications-and-crons]]). `IWhatsAppProvider` already
   exists.
3. **Razorpay** — `IPaymentProvider` interface + `RazorpayProvider`. Payment
   Link per invoice; webhook → mark invoice paid → send receipt. The webhook
   is the first genuinely server-only event, so this is where server-side
   PostHog (`posthog-node`) gets introduced — see [[decision/infrastructure]].

**The hero loop:** create invoice → finalise → "Send on WhatsApp" → PDF
generated → WhatsApp delivered with PDF + UPI link → customer pays → webhook
→ invoice `paid` → receipt sent. This is the demo that sells AstraBill.

## Sequencing & parallel work

1. **Submit Meta templates now (parallel):** `astrabill_otp_v1` +
   `astrabill_invoice_v1`. Submit Razorpay KYC alongside. Both take
   weeks — start the clock so they're not the bottleneck.
2. **Phase 2A** — done.
3. **Phase 2C** *(shipped)* — template engine + 2 templates + branding
   model + Cloudinary logo upload + `/settings/branding` UI.
4. **Phase 2D** — white-label app shell. Step 1 (foundation) shipped
   2026-05-19; Steps 2–4 are the page migrations, real KPIs, and
   mobile. 2D was inserted between 2C and 2B because every 2B feature
   wants 2D's URL shape and chrome to live in.
5. **Phase 2B** — build once Meta + Razorpay are verified AND 2D Step 2
   has migrated the invoice page (where the Send-on-WhatsApp button
   lives). The PDF the loop sends is the one 2C made worth sending.
6. **Festive/themed templates + column toggles (2C.5)** — interleaved
   with 2B once the core 2C lands.

## Related Pages

- [[customer/hardware-shop-owner]] — the real invoices Phase 2 is built from
- [[competitor/mybillbook]] — the competitor whose template-system pressure
  forced 2C into existence
- [[decision/invoice-design-system]] — 2C LLD
- [[decision/white-label-app-shell]] — 2D LLD (the app-shell parallel to 2C)
- [[decision/v1-scope]] — the four V1 features
- [[decision/database-and-rbac]] — the flat-select rule for numeric tables
- [[decision/pdf-generation]] — the PDF microservice 2C extends
- [[decision/payment-gateway]] — Razorpay
- [[decision/whatsapp-meta-api]] — the Meta send path
- [[decision/infrastructure]] — where server-side PostHog enters in 2B
