---
type: decision
updated: 2026-05-19
sources: 0
---

# Phase 2C — Invoice Design System

Rationale + LLD for the invoice-template + brand-customization work.
Binding choices that come out of this work land in `DECISIONS.md` under
a new "Product — Invoice design & branding" section; this page is the
*why*, the *sequencing*, and the *open questions*.

## Why this is in scope at all

The competitive landing-page pass on 2026-05-19 ([[competitor/mybillbook]])
made it concrete: **brand-customized invoices are the #1 paid-tier
upsell** in the Indian SME billing category. myBillBook leads with it
("Your bill, Your Brand: Color · Logo · Font · And More!"). Vyapar
ships a heap of templates. Tally is the only one that doesn't — and
Tally is what AstraBill is replacing.

The buyer test isn't *can the software make a PDF*. It is *can the PDF
look like my shop's invoice* — owner name in the right serif, logo at
the top, shop's brand colour on the table headers, T&C in the owner's
preferred phrasing. When the owner WhatsApps it to their customer, the
customer should see the owner's brand, not "yet another billing app".

## Why this should land *before* Phase 2B (WhatsApp loop)

1. **No external blockers.** 2C is purely codebase + Cloudinary. Meta
   WABA template verification and Razorpay KYC (both 2B prerequisites)
   take weeks; 2C can fill that calendar window.
2. **2B sells what 2C builds.** The WhatsApp loop's hero artifact is
   the PDF the customer opens on their phone. If the PDF is generic,
   the loop is selling a generic artifact.
3. **Retention test.** Day-1 signup → first invoice → "this looks like
   my shop's invoice" is the trust moment that converts trial to paid.
   Generic-PDF Day-1 → bounce.

(Trade-off: 2B is the *differentiating wedge* — WhatsApp delivery is
where AstraBill beats myBillBook. So 2C-before-2B costs us a few weeks
of "still no WhatsApp send" — that's the cost we accept for shipping
2B against a better foundation.)

## Scope

### What lands in V1 (2C-1)

- **Branding fields on businesses** — logo URL (`logo_url` already in
  schema, currently dormant), `brand_color` (single hex),
  `brand_font` (enum), `invoice_template_id` (enum),
  `invoice_settings` JSONB (column-visibility flags).
- **Logo upload** — Cloudinary signed direct-upload from the browser
  ([[decision/infrastructure]] already names Cloudinary). Onboarding
  gains an optional logo step; `/settings/branding` lets them change
  it.
- **Two invoice templates**:
  - **Modern** — Inter, brand-colour accents, minimal borders. Default.
  - **Classic** — serif, traditional Indian business look (Om Glass
    Enterprises' real invoice is the reference).
- **Settings UI** — `/settings/branding` page; tabs for Template,
  Colors, Font, Columns. Live preview of the user's actual most-recent
  invoice with branding applied.

### What lands in V1.x (2C-2)

- **Thermal 80mm template** — POS printer format, monospace,
  condensed, for buyers who print on a Bluetooth thermal printer.
  Cut from V1 (2026-05-19, user's call) to keep the V1 ship to two
  well-crafted templates; lands in 2C.5.
- **Festive / themed templates** — Ganesha, Lakshmi, generic festive
  border, neutral floral. myBillBook treats these as paid-tier; we'll
  ship a couple on the free plan to under-cut their upsell.
- **Per-column visibility** — show/hide HSN, batch, MFG, EXP, discount,
  tax columns. Pharma businesses need batch/MFG/EXP; hardware doesn't
  want them cluttering the row. Settings JSONB; templates respect it.
- **Custom T&C library** — pre-written terms templates (jurisdiction,
  late-payment interest, return policy) + edit-yours.

### Explicitly out of scope (V2+)

- **User-uploaded HTML templates** — security + support nightmare.
- **A drag-and-drop builder** like myBillBook's column-toggle canvas.
  Three great defaults beats one generic + builder.
- **Per-invoice template override** — choose template at create time.
  V1 is per-business default.
- **Hindi / regional language invoices.** Font system supports
  Devanagari from day one (Noto Sans family); the *content
  translation* lands when V2 ships Hindi UI.

## Architecture

### Template engine

Each template = self-contained file (HTML + CSS, possibly Handlebars
or LiquidJS for substitution) in the PDF microservice
([[decision/pdf-generation]]). Microservice receives:

```jsonc
POST /render
{
  "template": "modern" | "classic",
  "branding": { "logoUrl", "color", "font" },
  "settings": { "columns": { "hsn": true, "batch": false, ... } },
  "invoice": { ...full invoice JSON, line items inline... }
}
```

Returns PDF bytes. Uploads to Cloudinary in a wrapper layer, returns
Cloudinary URL. The split keeps the renderer pure.

**Why template-files-in-microservice and not server-rendered React
pages:** keeps the renderer free of Next.js coupling. The PDF service
can be deployed and tested independently; Puppeteer points at
`file:///templates/modern.html` (with `template`-loaded data) and
prints. No HTTP round-trip to Next.js, no auth tangle.

### Font handling

Each template declares the fonts it uses; the microservice ships those
fonts as `.woff2` next to the template file and references them with
`@font-face url('./Inter-Regular.woff2')`. Puppeteer reads the local
file. **No web-font CDN** — print determinism matters; a temporary
CDN outage would render fallback Times New Roman on the customer's
invoice, which is unacceptable.

Devanagari support: bundle Noto Sans Devanagari on every template
even before Hindi UI ships, so a Hindi business name on a customer
invoice renders correctly.

### Branding data model — proposed

New columns on `businesses` (drizzle migration 0003):

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `logo_url` | text | NULL | Cloudinary URL; existed in schema, now wired |
| `brand_color` | text | `#2563eb` | hex; validated `/^#[0-9a-fA-F]{6}$/` |
| `brand_font` | text | `'inter'` | enum: `'inter' \| 'poppins' \| 'noto_serif' \| 'noto_sans'` |
| `invoice_template_id` | text | `'modern'` | one of `'modern' \| 'classic'` (validated by Zod, not a pg enum — 2C.5 templates add without a migration) |
| `invoice_settings` | jsonb | `{}` | column-visibility + future toggles |

Per-invoice override: deferred. Every invoice picks up the business's
current branding *at render time* (not at create) — so changing the
template re-renders existing invoices the new way. Customer trust
implication: if they re-open an old WhatsApp share-link, the PDF
might look different from what they originally received. We accept
that for V1 (the data is identical; only the chrome changes); V2
considers snapshot-at-finalise.

### Cloudinary signed upload flow

- New endpoint `POST /api/uploads/signature` — returns Cloudinary
  signed params (timestamp + signature + folder restriction). Auth-
  gated; only authed users can sign. Folder pinned to
  `astrabill/{businessId}/logos`.
- Browser uploads direct to Cloudinary using the signature; gets back
  `secure_url`.
- Browser PATCHes `/api/businesses/{id}` with `logo_url`.
- `logo_url` validated against the Cloudinary host whitelist (server
  side) so a malicious PATCH can't inject an arbitrary URL.

### Customization UI — `/settings/branding`

New route under the AppShell ([[decision/frontend-architecture]]).
Tabs:

1. **Template** — template thumbnails (two in V1), click to select
2. **Colors** — brand colour picker (HSL picker + preset palette)
3. **Font** — radio list of four fonts with sample preview
4. **Columns** — toggle list (HSN, Batch, MFG, EXP, Discount, Tax)

Right pane: live preview of the user's most-recent finalised invoice
with the current settings applied (or, if no invoice exists, a
realistic sample). Preview is a server-rendered iframe pointing at
`/i/preview?template=...&color=...` — uses the same template files
the PDF microservice does, so what they see is what they print.

## Resolved (locked in DECISIONS.md, 2026-05-19)

1. **Default template = Modern.** Phone is the read-surface; Modern
   beats Classic there. Classic is one click away in the picker.
2. **Branding on Free, festive + columns on Paid.** Logo, colour,
   font, and both V1 templates are Free-plan features. Paid
   tiers (2C.5) unlock festive/themed templates, column-toggle
   visibility, and Free-plan-footer removal. The branding basics
   are the trust moment; you cannot earn retention through a paywall
   on the basics.
3. **"Made with AstraBill" footer = yes, on Free.** 8pt grey, centred,
   bottom of every page. Removed on paid plans. Doubles as organic
   distribution (every customer who opens an invoice sees the mark).
4. **Font set = 4.** Inter, Poppins, Noto Serif, Noto Sans
   (Devanagari-capable). No fifth ornate face in V1 — festive
   templates in 2C.5 carry that buyer segment.

## Open during the build

The non-binding choices that resolve in design review, not SSOT:

- **Festive template set for 2C.5.** Probably Ganesha + Lakshmi +
  one secular-festive (floral border). Final list lands when 2C.5
  starts.
- **Per-business default for `invoice_settings` columns.** All-on by
  default, but hardware/retail vs pharma have different defaults.
  Could ship a per-vertical preset picker during onboarding — V1.1
  question, not a 2C blocker.
- **Scale-to-fit (deferred — revisit if real invoices hit it).**
  Stage 2 tightened the Modern template's rhythm so a typical
  invoice (3-12 line items + every section) lands on one page, and
  a genuinely long one paginates cleanly. A narrow window remains:
  an invoice at ~13-16 items can land at ~1.05 pages and push a
  little content over. It never looks like a fragment (page 2 still
  carries the whole summary / HSN / bank / terms), so it is not a
  blocker. The bulletproof fix is scale-to-fit — measure rendered
  content height in `render.ts`; if it overflows one page by
  ≤~15%, re-render with a Puppeteer `scale` so it snaps onto one
  page. Costs a measure-then-rerender pass only when triggered.
  Deferred at the user's call (2026-05-19) — add it if production
  invoices actually land in that window.

## Brand-colour application — resolved in build (Stage 2)

The Modern template uses the brand colour on: the 3px top accent
bar, the line-items table header band, and the grand-total box.
The H1, body, and section labels stay token-neutral. Too much
colour reads as a brochure, not an invoice.

## Related Pages

- [[competitor/mybillbook]] — the competitor that forced this scope
- [[decision/pdf-generation]] — the microservice this work extends
- [[decision/infrastructure]] — Cloudinary already chosen
- [[decision/phase-2-plan]] — sequencing: 2C before 2B
- [[customer/hardware-shop-owner]] — Om Glass real invoices = Classic
  template's reference

## Status

In build (2026-05-19). **Stages 0–5 shipped + tested end-to-end** — an
invoice downloads as a real branded PDF from its detail page.

- **Stage 0** — render contract (`lib/pdf/contract.ts` + a mirror in
  `pdf-service/src/contract.ts`) + four typed fixtures. `c70b908`.
- **Stage 1** — `pdf-service/`: Express + Puppeteer + React SSR,
  `POST /render`. `5b0d23f`.
- **Stage 2** — premium Modern template: embedded Inter, real
  typography, proper multi-page (repeating table header, no split
  rows/blocks, per-page Puppeteer footer). `02c388c`.
- **Stage 3** — migration 0003 (`brand_color`, `brand_font`,
  `invoice_template_id`, `invoice_settings` on `businesses`) +
  `PATCH /api/businesses/[id]` branding API. `f78fd4b`.
- **Stage 4** — Cloudinary signed logo upload, the secure backend:
  `lib/cloudinary.ts`, `POST /api/uploads/signature` (owner-gated),
  `isOurCloudinaryUrl` SSRF guard. `f8990ce`.
- **Stage 5** — `lib/services/invoice-pdf.ts` bridges DB → contract
  (HSN summary, amount-in-words, taxClass derived here);
  `GET /api/invoices/[id]/pdf` streams the PDF; "Download PDF"
  button on the invoice page; shared-secret guards `/render`.
  `bda31cd`.
- Polish from real renders: trailing-zero trim on qty/GST, tighter
  top margin (`b9cfdee`); the line "Amount" column is the pre-GST
  taxable value so it reconciles with the subtotal (`59fb4ce`).

**Remaining — pick up here in the next chat:**

1. **Fonts** — Poppins / Noto Serif / Noto Sans packages are
   installed in `pdf-service/` (commit after `59fb4ce`); not yet
   wired. `pdf-service/src/fonts.ts` needs a `fontFaceCss(font)` per
   family, and the templates' `font-family` must follow
   `branding.font` (currently hard-Inter). Inter is already wired.
2. **Classic template** (was Stage 7) — second template component in
   `pdf-service/src/templates/`; registry currently aliases
   `classic` → Modern. Serif, traditional; Om Glass real invoices
   are the reference.
3. **Stage 6 — `/settings/branding`** (the capstone, build last):
   template picker (Modern/Classic), brand-colour picker, font
   picker, logo-upload widget (uses the Stage 4 signature endpoint
   → Cloudinary → PATCH), live preview. Reordered *after* fonts +
   Classic so every control it exposes is real.

Local run: pdf-service `cd pdf-service && npm run dev` (:4000);
`.env.local` has `PDF_SERVICE_URL`. Cloudinary creds are set.
