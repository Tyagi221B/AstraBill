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
- **Three invoice templates**:
  - **Modern** — Inter, brand-colour accents, minimal borders. Default.
  - **Classic** — serif, traditional Indian business look (Om Glass
    Enterprises' real invoice is the reference).
  - **Thermal 80mm** — POS printer format, monospace, condensed. The
    half of buyers who still print on a Bluetooth thermal printer get
    a first-class output.
- **Settings UI** — `/settings/branding` page; tabs for Template,
  Colors, Font, Columns. Live preview of the user's actual most-recent
  invoice with branding applied.

### What lands in V1.x (2C-2)

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
  "template": "modern" | "classic" | "thermal_80",
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
| `invoice_template_id` | text | `'modern'` | enum: `'modern' \| 'classic' \| 'thermal_80'` |
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

1. **Template** — three template thumbnails, click to select
2. **Colors** — brand colour picker (HSL picker + preset palette)
3. **Font** — radio list of four fonts with sample preview
4. **Columns** — toggle list (HSN, Batch, MFG, EXP, Discount, Tax)

Right pane: live preview of the user's most-recent finalised invoice
with the current settings applied (or, if no invoice exists, a
realistic sample). Preview is a server-rendered iframe pointing at
`/i/preview?template=...&color=...` — uses the same template files
the PDF microservice does, so what they see is what they print.

## Open questions

These need user direction before / during the build:

1. **Default template** — Modern, or Classic? My read: **Modern**
   default, Classic switchable. Modern reads cleaner on a phone
   screen, which is where 90% of WhatsApped invoices are read.
2. **Free plan + branding** — myBillBook gates customization behind
   paid tiers. Do we put templates + colour + logo on **Free**, and
   gate only the festive/themed templates + column-toggle on paid?
   My read: **yes**, give branding away — it's the trust moment that
   converts free to paid through retention, not through a paywall.
3. **"Made with AstraBill" footer** — invisible by default, or 8pt
   grey at the bottom of the PDF? Pricing lever: paid plans remove it.
4. **Font set** — Inter, Poppins, Noto Serif, Noto Sans (Devanagari-
   capable). Want a fifth more "ornate" option (Playfair Display)
   for jewellers / boutique businesses?
5. **Brand-color application** — only on table header strip + accent
   line? Or also on the totals box, the H1, and the signature box?
   The "tasteful" answer is *table headers + accent only*; too much
   colour and the invoice looks like a brochure.

## Related Pages

- [[competitor/mybillbook]] — the competitor that forced this scope
- [[decision/pdf-generation]] — the microservice this work extends
- [[decision/infrastructure]] — Cloudinary already chosen
- [[decision/phase-2-plan]] — sequencing: 2C before 2B
- [[customer/hardware-shop-owner]] — Om Glass real invoices = Classic
  template's reference

## Status

Not started. Awaiting user direction on the open questions above
before opening migration 0003.
