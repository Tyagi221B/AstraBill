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

Four steps, all shipped 2026-05-19. **Phase 2D is complete.**

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
4. **Mobile shell** *(shipped)* — `MobileNav`: a top bar + slide-in
   drawer below `md`. The sidebar body (`SidebarContent`) is shared
   between the desktop `<aside>` and the drawer.

**Mid-2D detour — payment recording** *(shipped 2026-05-19)*. Steps 3
+ the customer-udhaar view both need real paid/unpaid numbers, and
nothing was ever marked paid. Manual payment recording was built as
the prerequisite — see [[decision/payment-recording]]. Step 3's KPIs
become real with it in place.

## Phase 2B — WhatsApp Send + UPI  (the hero loop)

Kicked off 2026-05-19. Two Meta utility templates submitted for review
(`astrabill_invoice` + `astrabill_payment_reminder`) — both Utility,
text body + dynamic URL button at `https://www.astrabill.com/i/{{1}}`.
ETA ≈ 3h for approval. The button URL **locks the public-view path
in stone** — once Meta approves, changing it invalidates every sent
link + needs a new template.

While Meta reviews, the prerequisites land:

0. **Public invoice share** *(shipped)* — the URL the button points
   at. `share_token` column on invoices, generated at finalise; auth-
   free `/i/[shareToken]` page; `/api/i/[shareToken]/pdf` public
   download; the token IS the auth. See
   [[decision/public-invoice-share]].

1. **PDF microservice** *(shipped in 2C)* — Node + Express + Puppeteer
   on Digital Ocean ([[decision/pdf-generation]]). The same renderer
   now backs both the authed download and the public PDF endpoint.

2. **WhatsApp invoice send** *(shipped)* — `astrabill_invoice`
   template approved by Meta, full send loop built on top: repo
   (immutable history), service (membership + permission + finalised
   + has-phone guards, lazy share_token backfill, transport-layer
   var sanitisation), thin POST route, and a `WhatsAppPanel` card on
   the invoice detail page with send/resend + send history. The hero
   loop is now end-to-end. See [[decision/whatsapp-invoice-send]].
3. **UPI deep link (V1)** *(shipping)* — `upi://pay?...` "Pay ₹X via UPI"
   button + QR code on the public share page and the invoice PDF, pointed at
   the shop's own VPA (`businesses.upi_id`). Manual reconciliation via the
   existing payment-recording flow. Razorpay deferred to V1.x —
   see [[decision/upi-deep-links]].

**The hero loop:** create invoice → finalise → "Send on WhatsApp" → PDF
generated → WhatsApp delivered with share-link + UPI deep link → customer
pays via their UPI app → shop owner sees bank SMS → records payment in
AstraBill → invoice `paid`. This is the demo that sells AstraBill.

## Sequencing & parallel work

1. **Submit Meta templates now (parallel):** `astrabill_otp_v1` +
   `astrabill_invoice_v1`. (Razorpay KYC is not on the V1 critical path
   anymore — see [[decision/upi-deep-links]].)
2. **Phase 2A** — done.
3. **Phase 2C** *(shipped)* — template engine + 2 templates + branding
   model + Cloudinary logo upload + `/settings/branding` UI.
4. **Phase 2D** — white-label app shell. Step 1 (foundation) shipped
   2026-05-19; Steps 2–4 are the page migrations, real KPIs, and
   mobile. 2D was inserted between 2C and 2B because every 2B feature
   wants 2D's URL shape and chrome to live in.
5. **Phase 2B** — build once Meta templates are verified AND 2D Step 2
   has migrated the invoice page (where the Send-on-WhatsApp button
   lives). The PDF the loop sends is the one 2C made worth sending. (Razorpay
   no longer on the 2B critical path — V1 ships the UPI deep link instead.)
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
- [[decision/upi-deep-links]] — V1 payment mechanism (UPI deep links)
- [[decision/payment-gateway]] — Razorpay rationale (superseded for V1; V1.x background)
- [[decision/whatsapp-meta-api]] — the Meta send path
- [[decision/infrastructure]] — where server-side PostHog enters in 2B
