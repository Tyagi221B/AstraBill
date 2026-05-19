# AstraBill Wiki Log

Append-only. Format: `## [YYYY-MM-DD] <operation> | <title>`

---

## [2026-05-17] init | Wiki initialized

Wiki structure created. AstraBill defined as billing software for SMEs. Market research phase begins.

## [2026-05-17] ingest | Market research pass 1 — India SME billing landscape

Sources ingested: India accounting software market reports, Tally pricing, Vyapar/KhataBook/Zoho/Refrens/Odoo competitor analysis, WhatsApp API pricing, GST compliance landscape, Razorpay Fix My Itch, UPI payment data, India MSME cash flow crisis data.

Pages created/updated:
- overview.md (thesis formed)
- index.md (full catalog)
- concept/india-sme-market.md
- concept/whatsapp-billing-opportunity.md
- concept/gst-compliance.md
- concept/pricing-model.md
- competitor/tally.md
- competitor/vyapar.md
- competitor/khatabook.md
- competitor/zoho-books.md
- competitor/refrens.md
- competitor/odoo.md
- decision/market-validation.md

Key findings: Market validated. Tally's learning curve confirmed (10x real cost). Vyapar's broken WhatsApp = wedge. RBAC gap = wedge. Marketing identified as the real moat, not product.

## [2026-05-17] ingest | Customer discovery — brother's glass/hardware shop + kacha/pakka insight

First customer profiled: glass + hardware shop owner. Key revelations:
- Multi-unit billing required (sq.ft., kg, linear ft.)
- Udhaar (contractor credit) tracking = the daily-use driver, not invoicing
- Kacha/pakka dual books = mainstream practice in Indian trading businesses
- Legal positioning: call it "estimates + cash receipts", never "kacha accounts"
- Competitors in this space (HisabKitab, BUSY, Marg ERP) exist but all have old UX and no WhatsApp

Pages created: customer/hardware-shop-owner.md

## [2026-05-17] lint | First full lint pass — fixed 9 contradictions, added DECISIONS.md

Opus 4.7 review found the wiki self-contradicting in 9 places (all in decision
content): Supabase Auth vs NextAuth in 3 pages, OTP-in-DB vs Redis, SMS vs WhatsApp
OTP, otp_codes table that shouldn't exist, free-tier 10 vs 20 invoices, "service
businesses first" vs trading-shop pivot in 2 pages, an orphan [[link]], and an
internal job-architecture contradiction.

Root cause: decisions were duplicated across pages; an LLM appends but does not
reconcile. Fix: created DECISIONS.md as single source of truth for all binding
facts. Decision pages now hold rationale only and link instead of restating.
Added SSOT + lint-before-commit rules to CLAUDE.md.

## [2026-05-17] lint | RLS dropped — 10th contradiction caught before schema build

New-chat (Opus 4.7) schema-planning session caught contradiction #10: the RLS
policy in database-and-rbac.md used `auth.uid()`, a Supabase Auth function — but
we use NextAuth. The policy would always match nothing, and our privileged Drizzle
connection bypasses RLS anyway. Lint pass missed it because we grepped the string
"Supabase Auth", not the semantics.

Decision: drop RLS entirely. Tenant isolation enforced in the repository layer
(every query scopes by business_id). Updated DECISIONS.md, database-and-rbac.md,
infrastructure.md. Also confirmed table count: 11 (10 business + accounts for
Google OAuth; no sessions/verification_token/otp_codes). Added GST split columns
and invoice type enum to the v1-scope schema.

## [2026-05-17] decision | audit log + soft delete added — table count 11 → 12

Schema-build session (Opus 4.7). User added three cross-cutting requirements
before coding: (1) an audit/activity log of every user action, (2) soft delete,
(3) standardised error + response handling. The audit log needs a table, so the
binding table count moved 11 → 12 (11 business tables incl. `audit_log` +
`accounts`). Updated the DECISIONS.md "V1 tables" row, added "Audit log",
"Deletes", and "Timestamps" rows. Added rationale sections to database-and-rbac.md
and refreshed the v1-scope.md table list. Also folded in: `businesses.plan`,
`created_by` on invoices/payments, `last_login_at`/`last_active_at` on users,
`round_off` on invoices, `deleted_at` on mutable tables. Schema build follows.

## [2026-05-17] decision | drafts = `invoices.status='draft'`; localStorage for pre-auth; multi-device "for free"

Schema-build session (Opus 4.7). User raised future AI feature: photograph an
estimate on mobile → OCR → auto-filled draft on desktop. Examined whether this
needs a separate `drafts` table or Redis-held drafts.

Realised the `invoices` table with `status='draft'` already gives us everything:
drafts are first-class invoices, multi-device works because they're in Postgres
and scoped to the business, and future AI features (OCR, suggested GST, auto-
categorise customer) compose by writing draft `invoices` rows — no new storage
layer. localStorage holds the pre-auth anonymous form state only (in-session,
not durable; does not contradict onboarding-flow.md's "no save for anonymous").

Added DECISIONS.md "Drafts" row. Created wiki/decision/drafts-and-multi-device.md.
Indexed. No contradiction with existing pages.

## [2026-05-17] decision | auth = two equal entry doors (Google + WhatsApp OTP), neither fallback

About to wire NextAuth. Reconsidered the "Fallback: Google OAuth" framing
from the earlier auth-strategy doc. For an Android user, Google one-tap is
faster than waiting for a WhatsApp OTP; for a user without Gmail handy, OTP
works first try. Neither door is fundamentally primary — the schema connects
both back to the same `users.id`.

Updated DECISIONS.md "Login methods" row (replaces "Fallback login") and
clarified the "Session strategy" row (JWT is stateless; DrizzleAdapter
persists users + accounts only, no sessions table). Rewrote the auth-strategy
page's framing section to "Two Equal Entry Doors" with the per-user-type
breakdown. Also removed the restated-fact decision table at the top of that
page (SSOT rule — pre-existing duplication caught now). Account linking when
a "missing channel" already belongs to another account is V1.1 (V1: refuse
and tell them to log in via the existing one).

## [2026-05-18] decision | file storage = Cloudinary; transactional email = Loops.so; Supabase scope clarified

Three related infra decisions after auth smoke-test green:

(1) **File storage moves from Supabase Storage to Cloudinary.** Free tier
covers V1 (25 GB storage + 25 GB bandwidth/month), built-in image transforms
make logo resizing for invoice PDFs trivial, strong Indian CDN presence, and
the OCR + AI add-ons compose with the future photograph→invoice feature
([[decision/drafts-and-multi-device]]).

(2) **Transactional email = Loops.so**, FROM `hello@astrabill.com` (display
"AstraBill"), Reply-To same; sending domain `astrabill.com` authenticated
once via SPF + DKIM + DMARC DNS records. Never use `asmit@astrabill.com` as a
FROM (conflates personal with system). WhatsApp remains the primary delivery
channel; email is secondary.

(3) **Supabase scope clarified — Postgres only.** New DECISIONS row makes
explicit what we don't use: no Supabase Auth, no Supabase Storage, no
Supabase Realtime, no `@supabase/supabase-js` anywhere. Codebase talks to
Postgres via `postgres` driver / Drizzle, full stop.

Updates: DECISIONS.md (3 new rows: File storage, Supabase scope, Transactional
email), wiki/decision/infrastructure.md (rewrote Supabase + Cloudinary +
Loops sections, refreshed env-vars listing), wiki/decision/pdf-generation.md
(removed Supabase Storage restatements; storage now described as the
provider-agnostic `IStorageProvider`), .env.example (Supabase Storage block
out, Cloudinary + Loops blocks in). Memory: created astrabill-email.md.

Pre-existing SSOT drift on pdf-generation.md cleaned up in the same pass —
the page now describes the redirect strategy without naming a specific
storage provider, which is the right level of abstraction for a "PDF
generation" decision page.

## [2026-05-18] ingest | Om Glass Enterprises real invoices → Phase 2 plan

User's brother shared 3 photographed documents from his shop (Om Glass
Enterprises, Roorkee) — two GST tax invoices and one delivery challan.
Ingested as ground truth for what a trading-business invoice actually needs.

Key findings:
- **Dual-unit billing** — a glass line shows BOTH "04 Pcs" and "11.34 Sq.Mt";
  rate is per sq.m, taxable value = area × rate. A single quantity+unit per
  line can't express it. The headline finding — a genuine moat.
- Bill-to and ship-to are separate blocks.
- Freight is its own row, added post-tax.
- Transport mode + vehicle number appear on the invoice.
- A non-GST delivery challan is a real, separate document type.
- Amount in words; original/duplicate/triplicate copies.

Updates: customer/hardware-shop-owner.md gained a "Real Invoices" section;
DECISIONS.md gained a "Product — Invoice Anatomy" section (dual-unit,
ship-to, freight, transport, `delivery_challan` type); created
decision/phase-2-plan.md — the HLD/LLD blueprint for Phase 2A (customers +
products + invoice-anatomy migration) and 2B (WhatsApp hero loop); noted the
auth-first vs anon-first divergence in onboarding-flow.md. Indexed.

Phase 1 (auth + the invoice CRUD round-trip loop) is complete and
smoke-tested. The build continues from phase-2-plan.md in a fresh session.

## [2026-05-18] ingest | supplier invoice (Hitesh Hardware → Om Glass) — 3 refinements

A 4th document: a supplier invoice billing the brother's shop (Hitesh
Hardware, Delhi → Om Glass, Uttarakhand). Refines the Phase 2 plan:

- **Interstate confirmed** — Delhi (07) → Uttarakhand (05) charges IGST @ 18%,
  CGST/SGST blank. Real-world validation of `classifyTax`. No change.
- **`set` unit** — hardware sells in sets ("30 set @ ₹530/set"). Added to the
  Phase 2 `unit`-enum migration alongside `sqm`.
- **Extra charges are a list, not one field** — this invoice has both
  "Loading" and "Freight" as separate rows. The earlier single-`freight`
  column decision is superseded: invoices carry a JSONB array of
  `{ label, amount }` post-tax charges. DECISIONS.md "Freight" row replaced
  with "Extra charges"; phase-2-plan.md migration updated.
- **Invoice terms** — real invoices print a T&C block (late-payment interest,
  jurisdiction). New DECISIONS row + `businesses.invoice_terms` in the
  Phase 2 migration.

Updated customer/hardware-shop-owner.md (sources 4 → 5), DECISIONS.md
"Product — Invoice Anatomy", and decision/phase-2-plan.md.

## [2026-05-18] ingest | computerised invoice (Diamond Tuff Glass) — competitor bar + refinements

A 5th source: Diamond Tuff Glass Enterprises tax invoice #4983 — the only
*software-generated* invoice in the set. Shows what the current best tool in
this trade produces (cramped, watermark-heavy, generic Tally output — the bar
AstraBill must beat).

Refinements captured:
- **Taxable vs non-taxable charges** — Diamond Tuff's "Hole, Cut Out Template
  Charge" is folded into the taxable value and *then* taxed at 18%; Om Glass's
  freight sits post-tax. So `extra_charges` entries need a `taxable` flag
  (+ `gstRate`), not a flat post-tax assumption. DECISIONS "Extra charges"
  row and the phase-2-plan migration updated.
- **FY-aware invoice numbering** — `DTG/24-25/4983` = prefix/FY/sequence.
  GST Rule 46 wants numbers "unique for a financial year". User chose
  FY-aware: `{prefix}/{FY}/{seq}`, resets per business+type+FY, prefix
  business-configurable. New DECISIONS row; phase-2-plan Step 1b added;
  v1-scope numbering line updated.
- **E-way bill number** — optional `eway_bill_number` field (recorded, not
  generated). HSN-wise tax summary — a PDF-rendering concern, derived from
  line items. Both added to DECISIONS + the plan.
- Proforma-invoice reference confirms the estimate → tax-invoice flow.

Updated customer/hardware-shop-owner.md (sources 5 → 6), DECISIONS.md
"Product — Invoice Anatomy" (Extra charges revised; new rows for Invoice
numbering, E-way bill, HSN tax summary), decision/phase-2-plan.md (Step 1
migration + new Step 1b numbering), decision/v1-scope.md.

The Phase 2 blueprint is now built from 6 real documents. Build proceeds
from phase-2-plan.md in a fresh session.

## [2026-05-18] edit | sharpened the kacha/pakka framing in hardware-shop-owner.md

A discussion exposed that the "How to Handle Kacha Accounts" section framed
the non-invoice document types as euphemisms for kacha ("the unbilled quote =
the 'kacha' record without calling it that") — muddled, and positioning-risky.

Reframed the section as "The Kacha Question — Our Position":
- "Kacha" conflates two things: (1) illegal tax evasion — AstraBill cannot
  and does not help with it; a digital record is *more* discoverable than
  paper, and that owner is not our customer; (2) informal-but-legal cash
  business — which is who we serve.
- Estimate / cash receipt / delivery challan are legitimate document types,
  not disguised kacha. The owner records the cash side for udhaar, clarity
  and getting paid — not tax-hiding.
- Strategic bet stated plainly: help SMEs formalise gracefully, not stay
  hidden. "Data management, not GST filing" legal position retained.

DECISIONS.md unchanged — its terse "never label it kacha" row was already
fine. Pure wiki framing refinement; no code, no decision change.

## [2026-05-18] decision | analytics + error tracking = PostHog; Sentry deferred

PostHog was added to the codebase via its setup wizard during Phase 2A but
had never been a recorded decision — SSOT drift. User's call: PostHog covers
**both** product analytics and error tracking for V1 (proven in their other
projects); Sentry is **deferred**, revisit only if PostHog's error tracking
proves insufficient — running both = two error trackers, two bills.

Updated DECISIONS.md: replaced the "Error alerting | Sentry" Stack row with
"Analytics + error tracking | PostHog" plus a "Sentry | Deferred" row.
Updated infrastructure.md (new "Analytics + Error Tracking — PostHog"
section, env-var list, event-hygiene rule) and notifications-and-crons.md
(the cron alerting path now names PostHog, not Sentry).

Code follow-up (not done here — separate pass): commit the wizard's
still-unstaged standalone files (instrumentation-client.ts, lib/posthog-server.ts,
next.config.ts, etc.), dedupe the double-fired events (`invoice_finalized` /
`invoice_draft_created` currently fire from both client and server with the
same name), wire `lib/http.ts`'s `reportInternalError` hook to PostHog, and
add the POSTHOG_* keys to .env.example.

## [2026-05-18] decision | Phase 2A shipped — numbering refinements recorded; plan reframed to 2B

Phase 2A built out across two commits (`1496cc7`, `944adf4`): the
invoice-anatomy migration, customers + products catalogues, extra-charge GST
math, stock movement on finalise, and a vitest correctness gate for
`lib/gst.ts`. Four numbering facts emerged *during* the build that the
DECISIONS.md "Invoice numbering" row didn't capture:

- The number is assigned **at finalise**, not create — a draft is not a
  legally issued document and must not consume a number.
- A draft therefore carries `number = NULL` until finalised (schema migration
  0002 dropped the NOT NULL; the partial unique index treats NULLs as
  distinct, so drafts coexist).
- The sequence counts **only finalised rows**, so an abandoned draft never
  burns a number — the issued series is gap-free (GST Rule 46).
- A business-set custom prefix applies to **tax invoices only**; sharing it
  across types would collide a tax invoice and an estimate on the unique
  index.

Updates: DECISIONS.md "Invoice numbering" row sharpened + new "Custom invoice
prefix" row (binding facts, once each). decision/phase-2-plan.md rewritten —
2A is shipped, so the page no longer carries the 2A build blueprint (that's
git history now); it keeps two rationale notes (the *why* behind
finalise-time numbering and tax-only prefix) and is otherwise the live 2B
blueprint. index.md summary line updated. overview.md gained a thesis-
evolution line. The earlier SSOT-drift risk — phase-2-plan.md restating
numbering facts that also live in DECISIONS.md — is now resolved: the page
holds rationale only and links.

## [2026-05-18] decision | PostHog reset — wizard reverted, minimal client-only setup

The PostHog setup wizard (recorded in the entry above) had scattered 14
events across 9 files, fired client+server duplicates of the same event
names, never called `identify()`, and left two competing env-var names. It
was reverted wholesale and rebuilt minimally against PostHog's own Next.js
App Router reference: `instrumentation-client.ts` init, `/ingest` reverse
proxy, layout-mounted `identify`, `reset` on sign-out, three curated
client-side events. `posthog-node` and the server-side client were removed
entirely — the server captures were pure duplicates of client events.
Commit `1bd9e2e`.

Wiki realigned to the shipped reality:
- DECISIONS.md "Analytics + error tracking" row: `posthog-js` only;
  `posthog-node` explicitly **deferred** to 2B (the Razorpay webhook is the
  first genuinely server-only event). The "Sentry — Deferred" row is
  unchanged and still correct.
- infrastructure.md "Analytics + Error Tracking" section rewritten — drops
  `posthog-node` / `lib/posthog-server.ts` / the `reportInternalError`→
  PostHog claim (never wired), documents identify-in-layout + reset + the
  three events, and the env block now lists `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
  + `NEXT_PUBLIC_POSTHOG_HOST` (the wizard's `POSTHOG_API_KEY` is gone).

The 2026-05-18 PostHog entry above is left intact (the log is append-only) —
its "code follow-up" punch list is superseded by this entry: the wizard files
were reverted rather than committed, the double-fired events were removed
rather than deduped, and `reportInternalError`→PostHog was dropped (V1 has no
server-side PostHog). notifications-and-crons.md is unchanged — the DO cron
worker is a separate Node service; its own `posthog-node` alerting lands when
that worker is built in 2B.

## [2026-05-18] decision | frontend foundation (F1) — Tailwind v4, theming, marketing site

The app had shipped on inline `React.CSSProperties` everywhere — fine for
proving the data layer, impossible to theme. Phase F1 lays the frontend
foundation and rebuilds the public landing page.

Decisions taken:
- **Tailwind v4** (CSS-config, `@theme`) + CSS-variable design tokens —
  semantic names (`background`/`foreground`/`primary`/`muted`/`border`…),
  one `:root` + `.dark` block. No `tailwind.config.js`.
- **Light + dark theming** via `next-themes` (class strategy, `.dark` on
  `<html>`, system default).
- **Marketing site as a route group** — `app/(marketing)/` carries its own
  Header/Footer; the authed app pages stay outside it. Root `app/layout.tsx`
  reduced to `<html>`/`<body>` + providers. `/` is the landing; the signed-in
  dashboard moved to `/dashboard` (added to `proxy.ts`; the in-app "← Home"
  links + post-sign-in destination now point there).
- **shadcn/ui deferred to the app pass** — the marketing components are
  hand-rolled Tailwind; the token foundation is already shadcn-shaped, so
  adopting it later for the app forms (Input/Select/Dialog/Table) is
  friction-free. Recorded as the intended path, not yet a binding row.
- App pages (invoices/customers/products) **not** migrated — left on inline
  styles; they move into an `(app)` group and onto the theme in a later pass.

Shipped: the themed landing page (hero, features, how-it-works, pricing,
CTA), a relocated themed `/dashboard`, and four basic legal/info pages —
`/privacy`, `/terms`, `/refund`, `/contact` — needed for Razorpay's website
verification (first-draft content, effective-dated, flagged for legal
review). SEO: `lib/seo.ts`, `robots.ts`, `sitemap.ts`, Organization JSON-LD,
per-page metadata, `metadataBase`.

Wiki: DECISIONS.md gained Styling + Theming (Stack) and Site structure (Code
Architecture) rows; created decision/frontend-architecture.md (rationale);
indexed. Next.js + Tailwind build green, tsc clean, vitest 41/41.

Still F2: the blog (MDX pipeline). Legal content needs a real review pass.

## [2026-05-19] decision | frontend app pass (F3) — shadcn/ui adopted, app pages migrated off inline styles, AppShell + welcoming sign-in

The companion to F1: every authed page (`/sign-in`, `/dashboard`, `/onboarding`,
`/customers/*`, `/products/*`, `/invoices/*`) had still been carrying inline
`React.CSSProperties` from Phase 2A. F3 finishes that migration, brings the
shadcn/ui foundation in, and dedupes the chrome that every app page was
hand-rolling.

Decisions taken:
- **shadcn/ui adopted, no preset.** Ran `npx shadcn@latest init` properly for
  the canonical setup (writes `components.json`, `lib/utils.ts` with `cn()`,
  installs `clsx` + `tailwind-merge` + `class-variance-authority` +
  `lucide-react` + `radix-ui` + `tw-animate-css`), but reverted the
  radix-nova preset's destructive parts: it had rewritten `Button.tsx` with
  dense `h-7`/`h-8`/`h-9` sizes that would have shrunk every marketing CTA,
  switched the brand-blue `--primary` to a grayscale OKLCH, and injected a
  duplicate Geist font import into `layout.tsx`. Kept the genuinely scalable
  pieces — the expanded token set (`--popover`, `--secondary`, `--chart-*`,
  `--sidebar-*` + the full radius scale) so future Dialog/Sheet/Sidebar
  primitives drop in without touching `globals.css`. `components.json` is
  now `style: new-york`, `baseColor: slate` (matches our blue brand).
- **Form primitives hand-rolled in shadcn v4 shape** — `Input`, `Label`,
  `Textarea`, `Card` (+ `CardHeader`/`CardTitle`/`CardDescription`/
  `CardAction`/`CardContent`/`CardFooter`), `Badge` (with a `tone` variant
  matching invoice statuses: neutral / info / success / warning /
  destructive). Each carries the `data-slot` attribute, uses
  `React.ComponentProps<...>` (no `forwardRef`), composes classes via
  `cn()`. Future `npx shadcn@latest add dialog` lands alongside.
- **`AppShell` server component** — sticky header (Logo · breadcrumbs ·
  ThemeToggle · SignOut) wrapped in `<Container>`, used by every authed
  page. The dashboard's hand-rolled header is gone; pages now declare
  `crumbs={[…]}` instead of inlining a back-link.
- **Welcoming copy on `/sign-in`** — the page now opens with
  "Welcome to AstraBill" (brand-gradient wordmark) and a one-sentence pitch
  ("Sign in to raise GST invoices, send them on WhatsApp, and get paid on
  UPI — all from your phone."), sign-in card centered in the viewport, Terms
  + Privacy footnote, and the "It's that simple." tagline at the bottom.

Constraints respected:
- `Button.tsx` and its `buttonClasses()` export are unchanged — marketing
  call sites (Hero, Header, Pricing, CtaBand) keep working untouched.
- `app/layout.tsx` unchanged — single Geist font source via `geist/font/sans`.
- Brand colors (blue `--primary`, gradient `--brand-from` → `--brand-to`)
  preserved in both light and dark.
- `Container` now uses `cn()` so callers' `max-w-*` reliably overrides the
  default via `tailwind-merge`.

Files: `components.json`, `lib/utils.ts`; `components/ui/{input,label,textarea,card,badge}.tsx`;
`components/app/AppShell.tsx`; `app/globals.css` (token expansion +
brand-restore merge); rewrote `app/sign-in/{page,SignInForm}.tsx`,
`app/dashboard/page.tsx`, `app/onboarding/{page,OnboardingForm}.tsx`,
`app/customers/{page,CustomerForm,new/page,[id]/edit/page}.tsx`,
`app/products/{page,ProductForm,new/page,[id]/edit/page}.tsx`,
`app/invoices/{page,[id]/page,[id]/InvoiceActions,[id]/edit/page,new/page,new/InvoiceForm}.tsx`;
`components/ui/Container.tsx` (cn() merge).

Wiki: DECISIONS.md unchanged (the Styling + Site structure rows already
covered Tailwind v4 + the route-group / app-shell split; shadcn adoption
was the *anticipated* path called out in those rows). decision/frontend-
architecture.md updated — the "shadcn deferred" paragraph is now "shadcn
adopted (F3)" with the rationale for the non-destructive merge and the
hand-rolled-vs-CLI tradeoff. overview.md thesis-evolution line added.

Typecheck clean. Dev-server smoke test: every migrated route returns 200.
The "app pass" branch of frontend work is now complete; further frontend
polish lands on top of this foundation.

## [2026-05-19] ingest | myBillBook competitor profile + Phase 2C scoped (Invoice Design System)

Wiki research caught a competitor gap: **myBillBook** (FloBiz, ~$40M
raised, "1 Crore+ businesses" on their landing) wasn't in the
competitor catalogue. The 6 landing screenshots ingested today show
their #1 paid-tier upsell is **brand-customizable invoices** — the
"Your bill, Your Brand: Color · Logo · Font · And More!" animated
hero, three template sizes (Thermal · A4 · A5), a "Customize your own
Invoice" drag-and-toggle builder, and "Special Themes" including a
Ganesha-watermarked variant.

Strategic implication: AstraBill's current PDF (one generic template,
no brand fields, no logo upload) does not clear the Indian SME
category's table-stakes bar. The "your customer sees your invoice
and knows it's *yours*" test is what converts a Day-1 free signup to
paid retention — and it's the artifact the future WhatsApp loop
delivers, so a generic PDF undermines the loop AstraBill is built
around.

Pages created:
- `wiki/competitor/mybillbook.md` — full profile, hero pitch
  verbatim, template catalogue, strengths/weaknesses, threat
  assessment. Updated `wiki/index.md`.
- `wiki/decision/invoice-design-system.md` — Phase 2C LLD. Template
  engine (parameterized per template, served from the PDF
  microservice), branding fields on `businesses` (`logo_url` already
  in schema, now wired up; new `brand_color`, `brand_font`,
  `invoice_template_id`, `invoice_settings` JSONB), Cloudinary
  signed-upload pipeline, `/settings/branding` UI with live preview,
  three V1 templates (Modern · Classic · Thermal 80mm), festive
  templates + column-toggle in 2C.5.

Wiki + DECISIONS realigned:
- `wiki/decision/phase-2-plan.md` — sequencing rewritten. **2C now
  lands before 2B.** Reason: 2C is unblocked codebase work;
  2B requires Meta WABA template verification + Razorpay KYC (both
  multi-week external blockers). Building 2C during that window
  means 2B's first WhatsApp send delivers a brand-customised PDF,
  not a generic one.
- `wiki/overview.md` — competitor differentiation table expanded to
  include myBillBook column + two new rows (brand-customizable PDF;
  themed templates). Thesis-evolution line added for the 2C-before-2B
  pivot.
- `wiki/index.md` — both new pages indexed.

`DECISIONS.md` left untouched in this entry — 2C's open questions
(default template, free-vs-paid branding gate, "Made with AstraBill"
footer, font set, brand-colour application breadth) are explicitly
listed in `decision/invoice-design-system.md` and resolved during
the build, not pre-decided in the SSOT.

Open question for the user: a couple of the 2C scope choices need
direction before migration 0003 opens — listed in the new decision
page's "Open questions" section.

## [2026-05-19] build | Phase 2C Stages 0–5 shipped — invoices render as branded PDFs

The Invoice Design System build. Eight planned stages; 0–5 done and
tested end-to-end (an invoice downloads as a real branded PDF).

- **Stage 0** `c70b908` — render contract + 4 fixtures.
- **Stage 1** `5b0d23f` — `pdf-service/`: Express + Puppeteer + React SSR.
- **Stage 2** `02c388c` — premium Modern template, multi-page handled
  (repeating header, no split blocks, per-page footer).
- **Stage 3** `f78fd4b` — migration 0003 (branding columns) + branding API.
- **Stage 4** `f8990ce` — Cloudinary signed logo upload (secure backend).
- **Stage 5** `bda31cd` — Next.js → pdf-service wiring, Download PDF button.
- Polish `b9cfdee`, `59fb4ce` — qty/GST zero-trim, line "Amount" is the
  pre-GST taxable value (reconciles with subtotal).

SSOT: thermal_80 cut from V1 → 2C.5 (reconciled across DECISIONS.md,
phase-2-plan.md, overview.md). Scale-to-fit deferred (noted in the
decision page's "Open during the build").

Remaining (next chat): wire the 3 newly-installed fonts (Poppins /
Noto Serif / Noto Sans) into `fonts.ts` + the templates; build the
Classic template; then Stage 6 — the `/settings/branding` UI as the
capstone. Full state in decision/invoice-design-system.md "Status".

## [2026-05-19] build | Phase 2C-1 complete — branding customization shipped

The Invoice Design System's V1 scope (2C-1) is done. Picking up from
Stages 0–5:

- **Fonts** `856dcbc` — `fonts.ts` embeds any of the four families
  (`fontFaceCss`); both templates' `font-family` follows
  `branding.font`; Poppins / Noto Sans carry their Devanagari subset.
- **Classic template** `5737c14` — the second real template (a ruled,
  traditional invoice with a signature block); the registry no longer
  aliases `classic` → Modern.
- **Stage 6** `3ee03ae` — `/settings/branding` (Template · Colors ·
  Font · Columns + logo upload), `GET /i/preview`, and a debounced
  live-preview iframe that renders through the real pdf-service.

2C ships before 2B as planned. Remaining 2C work is all 2C.5
(thermal-80, festive templates, the pharma column set + its template,
custom-T&C library). Full state in
decision/invoice-design-system.md "Status".

## [2026-05-19] build | Dynamic fit-to-page — invoices fill the A4 dynamically

User feedback on the just-shipped 2C-1: a short invoice's content read
small and stranded the bottom of the page — visibly less substantial
than myBillBook / Vyapar / Tally clones. Stage 2's tight 9.5px base
fit a 12-item invoice on one page at the cost of under-filling a
1–3-item one.

Reworked the renderer to be dynamic both ways. `fd6d66d`:

- Both templates' CSS converted to `rem` units (one root font-size
  drives the whole layout). Borders stay px so hairlines don't grow.
- `render.ts` measures `.doc` height after SSR and picks the root
  size that fills ~93% of A4. Short → scale UP (cap 16px), long →
  scale DOWN (floor 8.5px), genuinely long → default + paginate.
- Re-application via `page.evaluate` (inline style on `<html>`), no
  re-setContent. Total render ~165ms.

Replaces the originally-deferred one-directional scale-to-fit; the
shipped form handles UNDER-fill too. Updated
decision/invoice-design-system.md.

## [2026-05-19] build | Phase 2D Step 1 — white-label app shell foundation

User pushback: "we are randomly building stuff … the app should feel
like the owner's billing dashboard, not AstraBill's." The 2C work
made the *PDF* owner-branded; the *app shell* still said AstraBill,
opened to a business-picker card grid, and threaded `?businessId=` on
every URL. That mismatch is the gap 2D closes — parallel to 2C, but
on the chrome side.

Step 1 ships the foundation:

- `app/b/[businessId]/layout.tsx` — the ONE place a business is
  resolved + membership verified per request. 404 for non-members (no
  existence leak); the repository-level scoping stays as defence in
  depth.
- `components/app/BrandedAppShell.tsx` + `Sidebar.tsx` — sidebar with
  BusinessSwitcher (logo + name + dropdown), nav (Dashboard /
  Invoices / Customers / Products / Settings) with active state, a
  user menu + sign-out, and "Powered by AstraBill" at the foot.
  Branding is *subtle*: brand-colour shows on (1) the 2px left-edge
  accent of the active nav item and (2) the avatar fallback bg.
  Whole-sidebar-painted-brand-colour considered + rejected (gaudy at
  saturated user colours; contrast budget breaks).
- `lib/routes.ts` — SSOT for URL structure. `routes.b(id)` factory
  returns the family of business-scoped paths; pages never
  template-string a path.
- `app/dashboard/page.tsx` → smart redirect (no business → onboarding;
  has business → `/b/[mostRecent]/dashboard`).
- `app/b/[businessId]/dashboard/page.tsx` — placeholder (welcome +
  three "Coming soon" stat cards + quick-action buttons). Real KPIs
  in Step 3.
- `lib/services/businesses.ts` — new `getMostRecentBusinessForUser`.
- `proxy.ts` — added `/b/:path*` to the auth matcher.

Sidebar nav for non-dashboard sections still points to the OLD paths
(`/invoices?businessId=X` …) — a deliberate transitional gap. Step 2
of 2D migrates `/invoices`, `/customers`, `/products`,
`/settings/branding` under `/b/[businessId]/...`. Step 3 = real
dashboard KPIs. Step 4 = mobile (hamburger / drawer).

Decision page: `decision/white-label-app-shell.md`. Binding facts
added to DECISIONS.md under a new "Product — App shell & navigation
(Phase 2D)" section.

## [2026-05-19] build | Phase 2D Step 2 — pages migrated under /b/[businessId]/

Closed the transitional gap from Step 1. Invoices, customers,
products, and settings/branding all moved under /b/[businessId]/... —
every authed business page now renders inside the BrandedAppShell.

- businessId comes from the path param, not `?businessId=`.
- AppShell + crumbs dropped; pages render a new shared `PageHeader`
  (title / description / action) instead. AppShell stays only for
  /onboarding (the one non-business-scoped authed page).
- List pages are single-business now — the cross-business "Business"
  column and the business filter pills are gone.
- Detail/edit pages guard `row.businessId === params.businessId` so a
  crafted cross-business URL is a 404.
- Forms take a one-element businesses array, lock the <select>;
  redirects after save go through `routes.b(id)`.
- BrandingEditor lost its in-page business switcher (the sidebar owns
  switching). Sidebar nav uses canonical routes; proxy.ts + robots.ts
  drop the old top-level paths.

Verified with a clean production build — all 12 /b/[businessId]/*
routes resolve, no stale paths.

## [2026-05-19] build | Payment recording — the udhaar keystone

Stepped back mid-2D: customers + products are a working CRUD but the
*reporting* layer (customer udhaar, dashboard KPIs) was missing — and
it's all gated on one primitive that didn't exist. An invoice went
`draft → sent` and stayed `sent` forever; nothing was ever paid.

Built manual payment recording (the `payments` table already existed
in schema):

- `amount_paid` is derived — always `SUM(payments WHERE deleted_at IS
  NULL)`, never an incrementally-mutated counter. Status follows the
  sum (paid / partially_paid / sent) via one pure function.
- Record + void both lock the invoice row `FOR UPDATE`, so concurrent
  payments serialise and the re-sum can't lose a row.
- A void is a soft delete + recompute — the row stays, the audit log
  keeps both record + delete; correcting a typo = void + re-record.
- Payments only attach to finalised invoices.
- schema → repository → service → API (`POST /api/invoices/[id]/
  payments`, `DELETE /api/payments/[id]`) → `PaymentPanel` on the
  invoice detail page (summary bar + record form + history + void).

Decision page: `decision/payment-recording.md`. Binding facts in
DECISIONS.md under a new "Product — Payment recording" section.
Unblocks 2D Step 3 (real dashboard KPIs) and the customer udhaar view.

## [2026-05-19] build | Phase 2D Step 3 — real dashboard KPIs

The placeholder "Coming soon" cards on `/b/[businessId]/dashboard`
are now real numbers — possible only because payment recording
landed first (every figure is a function of what's been paid).

- Three KPIs: **outstanding** (`SUM(total - amount_paid)` over
  non-draft invoices — the udhaar headline), **paid this month**
  (`SUM(payments.amount)` since the 1st), **revenue this month**
  (`SUM(total)` over invoices issued since the 1st).
- **Recent invoices** — the six newest, with status + total,
  clickable through to the detail page.
- **Low stock** — active products at or below their alert threshold;
  the card only renders when there's something to flag.
- Layers: three SQL aggregate repo functions
  (`sumOutstandingForBusiness`, `sumRevenueForBusinessSince`,
  `sumPaymentsForBusinessSince`) + `listLowStockProducts` →
  `lib/services/dashboard.ts` (`getBusinessDashboard`, self-guarding
  on membership) → the rewritten dashboard page.
- "This month" is bounded at UTC midnight of the 1st — the IST skew
  at the boundary is an accepted V1 imprecision.

2D is now Steps 1–3 done; only the mobile shell (Step 4) remains.
No new decision page — this is Step 3 of `decision/white-label-app-
shell.md`, whose Status table is updated.

## [2026-05-19] build | Customer detail — the udhaar tracker

V1 feature #3 (udhaar tracker), seller side. `/b/[businessId]/
customers/[id]` — until now there was only a customer *edit* page;
no way to open a customer and see what they owe.

- Three udhaar KPIs: **outstanding** (`billed - paid` — what this
  customer still owes), **total billed**, **total paid** — all
  lifetime, computed over the customer's non-draft invoices
  (decimal.js, in the service).
- Contact card — phone / email / GSTIN / state / address / notes.
- Invoice history — every invoice for the customer, each with its
  own balance (`total - amount_paid`), click-through to the detail.
- Layers: `listInvoicesForCustomer` repo query →
  `getCustomerDetail` service (returns customer + invoices + stats,
  membership-scoped) → the new page. The customers list now links
  each name through to the detail page.
- `Kpi` card extracted to `components/app/Kpi.tsx` — shared by the
  dashboard and this page.

Real numbers throughout, possible because payment recording landed
first. No new decision page — a straightforward read view on top of
the payment primitive; `decision/payment-recording.md` Status
updated to mark the udhaar view shipped.

## [2026-05-19] build | Phase 2D Step 4 — mobile shell

The desktop sidebar was `md:`-only — below that breakpoint the app
had no navigation at all. For a mobile-first product where 90% of
WhatsApped invoices open on phones, that was a real gap.

- `Sidebar.tsx` split: the inner body extracted to a shared
  `SidebarContent` (BusinessSwitcher + nav + footer). The desktop
  `Sidebar` is now just the `<aside hidden md:flex>` wrapping it.
- New `MobileNav` — a sticky top bar (hamburger + business avatar +
  name) and a slide-in left drawer holding `SidebarContent`. The
  drawer is always mounted; opacity + transform toggle it so it
  slides and fades. Body scroll locks while open; Escape closes it;
  tapping a nav link closes it (via `SidebarContent`'s `onNavigate`).
- `BrandedAppShell` restructured — sidebar + a column holding the
  mobile header and `<main>`.

**Phase 2D is now complete** (Steps 1–4). The app feels like the
owner's branded billing dashboard on every screen size. Status tables
in `decision/white-label-app-shell.md` + `decision/phase-2-plan.md`
updated; no new decision page (Step 4 of an existing decision).

## [2026-05-19] build | Phase 2B kick-off — public invoice share

Two Meta WhatsApp templates submitted for review — `astrabill_invoice`
+ `astrabill_payment_reminder` — both Utility, with a dynamic URL
button pointing at `https://www.astrabill.com/i/{{1}}`. ETA ≈ 3h.
The button URL **locks the public-view path in stone** (changing it
later invalidates every sent invoice + needs a new template). So the
work this commit lands is the infrastructure the URL points at,
built first so it exists by the time Meta approves.

Built:

- `invoices.share_token` — text column, unique, nullable for drafts
  (`drizzle/0004_faithful_marvel_apes.sql`).
- `lib/share-token.ts` — `generateShareToken()`: 12 random bytes →
  16-char base64url (~96 bits of entropy; URL-safe; not the row
  UUID).
- `finalizeInvoice` now stamps both `number` AND `shareToken` in one
  transaction — invariant: a finalised invoice always has both.
- Unscoped repo reads: `getInvoiceByShareToken`, `findBusinessById`,
  `findCustomerById` — named `find*` (vs `get*ForUser`) to signal
  these skip tenant scoping; explicit comments warn off general use.
- `lib/services/public-invoice.ts` — `getPublicInvoiceView(token)`.
- `lib/services/invoice-pdf.ts` — `renderPublicInvoicePdfByToken`
  beside the existing auth-path renderer; both reuse
  `buildRenderRequest`.
- `/i/[shareToken]` page — mobile-first, brand-coloured accent
  stripe + button, full invoice readout, Download PDF CTA. Sets
  `noindex, nofollow` per page.
- `/api/i/[shareToken]/pdf` — public PDF endpoint, no
  `requireUser`; same pdf-service the authed download uses.
- `robots.ts` — `/i/` added to disallow list (belt-and-suspenders
  with the per-page noindex).

Auth model is **token IS the auth** — anyone with the URL sees the
invoice, by design. Same model as Stripe/Razorpay receipt links. No
rate limiting in v1.

Decision page: `decision/public-invoice-share.md`. Binding facts in
DECISIONS.md under a new "Product — Public invoice share" section.

Remaining for 2B (blocked on Meta approval): WhatsApp client module
+ "Send on WhatsApp" button on the invoice page +
`whatsapp_messages` logging.

## [2026-05-19] build | Phase 2B — WhatsApp send (hero loop end-to-end)

`astrabill_invoice` came back approved (~3h SLA). Built the rest of the
send loop on top of the public-share infrastructure shipped earlier
today.

What landed:

- `lib/repositories/whatsapp-messages.ts` — insert / mark-sent /
  mark-failed / list. Rows are immutable history (no soft-delete) —
  the table reflects the audit trail directly.
- `lib/services/whatsapp-send.ts` — `sendInvoiceOnWhatsApp` and
  `listInvoiceWhatsAppSends`. The service is the only file that knows
  the `astrabill_invoice` body-var order, language code, and URL-
  button binding. Guards: membership (404), `whatsapp:send` (403),
  finalised-only (409), customer-must-have-phone (422). Lazy
  share_token backfill for pre-2B finalised invoices via a race-safe
  conditional UPDATE. Transport-layer whitespace sanitisation against
  Meta's #131008.
- `POST /api/invoices/[id]/send-whatsapp` — a thin route. Maps
  service errors to HTTP via the standard wrapper.
- `WhatsAppPanel` card on the invoice detail page — send / resend
  button (label flips after the first send), masked phone display,
  full send history list with per-row status badges and error
  messages. Inline-status UX consistent with `PaymentPanel`; no toast
  library introduced.

What did NOT land here: `astrabill_payment_reminder` still in review
(not blocking — utility template for the V2 reminder cron), and the
Razorpay leg of 2B is separate work.

DECISIONS.md gained a "Product — WhatsApp invoice send (Phase 2B)"
section; rationale on the *why* lives at
[[decision/whatsapp-invoice-send]] (no fact restatement).
