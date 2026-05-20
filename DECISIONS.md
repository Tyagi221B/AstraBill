# AstraBill — DECISIONS

The single source of truth for every binding technical and product decision.

**Rules:**
- Every fact appears here EXACTLY ONCE. Decision pages explain the *why*; this file holds the *what*.
- Read this file FIRST in any building session.
- Changing a decision = edit the row here, then grep the wiki for stale copies.
- `wiki/decision/*.md` pages carry rationale only — they must never restate a fact, only link here.

Last reconciled: 2026-05-17

---

## Stack

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Frontend + API | Next.js 16 on Vercel | — | [[decision/infrastructure]] |
| Database | Supabase PostgreSQL | MongoDB | [[decision/database-and-rbac]] |
| ORM | Drizzle | Prisma | [[decision/database-and-rbac]] |
| Money fields | `NUMERIC(12,2)` | float / MongoDB number | [[decision/database-and-rbac]] |
| Migrations | Drizzle Kit | manual SQL | [[decision/database-and-rbac]] |
| Environments | Single Supabase project shared by **all three** origins — dev (`localhost:3000` / `.env.local`), preprod (`test.astrabill.com`), and prod (`www.astrabill.com` on Vercel). `npm run db:migrate` applies once and is visible to all three. Will split into a separate staging project before V1 GA | running an experimental migration against `.env.local` thinking it's a sandbox; treating local writes as throwaway test data (they ARE prod data right now) | [[decision/infrastructure]] |
| PDF generation | Puppeteer microservice on Digital Ocean | `@react-pdf/renderer`, serverless Puppeteer | [[decision/pdf-generation]] |
| Job scheduling | node-cron on the DO worker | DB-polling jobs table, pg_cron | [[decision/notifications-and-crons]] |
| WhatsApp send queue | BullMQ + Redis on DO | — | [[decision/notifications-and-crons]] |
| Analytics + error tracking | PostHog — product analytics, funnels, session replay AND exception capture. V1 is client-only: `posthog-js`, initialised in `instrumentation-client.ts`, reverse-proxied via `/ingest` to dodge ad-blockers. Server-side `posthog-node` is deferred until a genuinely server-only event exists (the 2B Razorpay webhook) | a second error tracker in parallel; firing one event name from both client and server; silent failures | [[decision/infrastructure]] |
| Sentry | Deferred — PostHog covers error tracking for V1. Revisit Sentry only if PostHog's error tracking proves insufficient | wiring Sentry now (two error trackers) | [[decision/infrastructure]] |
| File storage | Cloudinary — invoice PDFs, business logos, customer-facing images. Free tier covers V1; image transforms + Indian CDN built in | Supabase Storage; binaries in Postgres | [[decision/infrastructure]] |
| Supabase scope | Postgres only — no Auth, no Storage, no Realtime, no Edge Functions. We talk to it via the `postgres` driver / Drizzle | calling Supabase JS from the browser; `@supabase/supabase-js` anywhere in the codebase | [[decision/infrastructure]] |
| Transactional email | Loops.so. FROM `hello@astrabill.com` (display "AstraBill"), Reply-To same; sending domain `astrabill.com` authenticated (SPF + DKIM + DMARC) | sending from `asmit@astrabill.com`; `noreply@` for default sends | [[decision/infrastructure]] |
| Styling | Tailwind v4 (CSS-config, `@theme`) + CSS-variable design tokens; components reference semantic tokens (`bg-background`, `text-foreground`…), never raw hex | inline `React.CSSProperties` for new work; a `tailwind.config.js` (v4 configures in CSS) | [[decision/frontend-architecture]] |
| Theming | Light + dark, class strategy via `next-themes` (`.dark` on `<html>`), system default. One token block in `globals.css` per theme | a second source of colour; hard-coded light-only colours | [[decision/frontend-architecture]] |

## Auth

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Auth provider | NextAuth v5 (AuthJS), credentials provider | Supabase Auth | [[decision/auth-strategy]] |
| OTP channel | WhatsApp (Meta API), authentication template | SMS | [[decision/auth-strategy]] |
| OTP storage | Redis — SHA-256 hash, 5-min TTL, single-use | DB table (`otp_codes` does NOT exist) | [[decision/auth-strategy]] |
| Session strategy | JWT (stateless cookies). DrizzleAdapter persists `users` + `accounts` (Google OAuth) only — there is no `sessions` table | DB-stored sessions; Supabase Auth sessions | [[decision/auth-strategy]] |
| Login methods | Two equal entry doors — Google OAuth + WhatsApp OTP — both first-class. The missing channel is collected post-onboarding (phone required for WhatsApp send; Google optional for fast re-login) | "primary/fallback" framing; forcing one path at signup | [[decision/auth-strategy]] |

## Data Model & Access

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Multi-tenancy | One user → many businesses via `business_members` join table, role per business | global roles | [[decision/database-and-rbac]] |
| Roles | owner, admin, accountant, salesman, viewer | — | [[decision/database-and-rbac]] |
| RBAC | TypeScript service layer (`lib/rbac.ts`) | RBAC logic in SQL | [[decision/database-and-rbac]] |
| Relational reads | Flat `db.select()` + JS join for any read touching a `numeric`-bearing child table | Drizzle's relational `with:` on numeric tables — its `json_build_array` aggregation turns `numeric` into a JS `number`, breaking the string type | [[decision/database-and-rbac]] |
| Tenant isolation | Repository layer — every query scopes by `business_id` | RLS (broken under NextAuth: `auth.uid()` is NULL; privileged role bypasses RLS) | [[decision/database-and-rbac]] |
| `business_id` placement | On every table, including child tables (line items, payments, stock movements, whatsapp messages, audit log) | — | [[decision/database-and-rbac]] |
| V1 tables | 11 business tables (incl. `audit_log`) + `accounts` (NextAuth Google OAuth) = 12. No `sessions` (JWT), no `verification_token` (no email magic links), no `otp_codes` (Redis) | `otp_codes`, `sessions`, `verification_token` | [[decision/v1-scope]] |
| Audit log | `audit_log` table — every data mutation + auth event, written in-transaction from the service layer | DB triggers for audit; fire-and-forget audit writes | [[decision/database-and-rbac]] |
| Deletes | Soft delete (`deleted_at` timestamptz) on mutable business tables; repositories filter `deleted_at IS NULL` by default | hard delete of business data; deleting a finalized invoice (issue a credit note instead) | [[decision/database-and-rbac]] |
| Timestamps | `timestamptz` (UTC) for instants; Postgres `date` for calendar dates (`issue_date`, `due_date`); convert to IST at the display edge | `timestamp` without zone | [[decision/database-and-rbac]] |
| Drafts | Stored as `status='draft'` rows in `invoices` (multi-device follows because they're in Postgres); localStorage holds in-session form state during the pre-auth anonymous drive-by only | a separate `drafts` table; Redis-held drafts; persistent anonymous storage; cross-device anonymous drafts | [[decision/drafts-and-multi-device]] |

## Integrations

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Payments | Razorpay — Smart Collect + Payment Links | becoming a payment gateway / routing money | [[decision/payment-gateway]] |
| Payment abstraction | `IPaymentProvider` interface | calling Razorpay SDK directly from services | [[decision/payment-gateway]] |
| WhatsApp API | Meta Cloud API, direct (existing Opryon Labs WABA) | BSP middleman | [[decision/whatsapp-meta-api]] |
| WhatsApp abstraction | `IWhatsAppProvider` interface | — | [[decision/whatsapp-meta-api]] |
| WhatsApp sender identity | AstraBill's own number (not the shop owner's) | — | [[decision/v1-scope]] |
| PDF URL delivery | Redirect endpoint `/i/[invoiceId]/pdf` on our domain | raw Supabase signed URLs in WhatsApp | [[decision/pdf-generation]] |

## Code Architecture

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Layering | thin API route → service → repository → DB | business logic in routes or DB | [[decision/code-architecture]] |
| External services | behind interfaces, swapped via one `index.ts` line | concrete calls from services | [[decision/code-architecture]] |
| Validation | Zod at the API boundary only | — | [[decision/code-architecture]] |
| Errors | typed (`AppError`, `NotFoundError`, `ForbiddenError`...) | generic `Error` or strings | [[decision/code-architecture]] |
| Side effects | queued (PDF, WhatsApp), API returns fast | blocking the request | [[decision/code-architecture]] |
| Site structure | Marketing site under `app/(marketing)/` (own Header/Footer chrome) is separate from the authed app; root layout holds only `<html>`/`<body>` + providers. Shared UI in `components/{ui,marketing,theme,app}` | marketing chrome leaking onto app pages; loose components inside `app/` | [[decision/frontend-architecture]] |

## Product — V1 Scope

| Area | Decision | Rationale |
|------|----------|-----------|
| V1 features | (1) GST invoice + PDF, (2) WhatsApp send + UPI payment link, (3) udhaar tracker, (4) basic inventory | [[decision/v1-scope]] |
| First customer | The brother's glass + hardware shop — a **trading business** | [[customer/hardware-shop-owner]] |
| Primary vertical | Trading / retail shops (hardware, glass, building materials) first | [[customer/hardware-shop-owner]] |
| Language | English only in V1; Hindi in V2 | [[decision/v1-scope]] |
| Onboarding | V1 ships **auth-first** (sign in → business → invoice). Anonymous-first is the V1.x target | [[decision/onboarding-flow]] |
| Kacha/pakka | Support as "Estimate" and "Cash Receipt" — never label it "kacha" | [[customer/hardware-shop-owner]] |

## Product — Invoice Anatomy

Derived from real Om Glass Enterprises invoices ([[customer/hardware-shop-owner]]).
Shipped in Phase 2A — see [[decision/phase-2-plan]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Dual-unit line items | A line carries a rate-bearing `quantity`+`unit` AND an optional secondary `quantity`+`unit` (informational — glass billed per sq.m, counted in pcs). GST math runs on the rate-bearing pair only | a single unit per line | [[customer/hardware-shop-owner]] |
| Bill-to vs ship-to | Invoice carries an optional ship-to name + address, distinct from the bill-to customer | — | [[decision/phase-2-plan]] |
| Extra charges | Invoice carries a JSONB list of `{label, amount, taxable, gstRate?}`. Taxable charges (cutting, hole, processing) fold into the taxable value **pre-GST**; non-taxable (informal freight, loading) add **post-tax** | a single fixed `freight` column; assuming all charges are post-tax | [[decision/phase-2-plan]] |
| Invoice numbering | `{prefix}/{FY}/{seq}` — e.g. `INV/26-27/0001`. Assigned **at finalise**, not at create; a draft carries `number = NULL` until then. FY derived from the issue date the invoice holds at finalise (Indian FY, Apr–Mar). The sequence resets per business + type + FY and counts **only finalised rows**, so the issued series stays gap-free even when a draft is abandoned. A `FOR UPDATE` lock on the business row serialises assignment | numbering a draft; counting drafts toward the sequence; reusing a number; a never-resetting running number (Phase 1's `INV-0001` invoices keep the numbers they were issued) | [[decision/phase-2-plan]] |
| Custom invoice prefix | `businesses.invoice_number_prefix`, when set, overrides the default prefix for **tax invoices only**; estimates / credit notes / debit notes / delivery challans always keep their built-in prefix (`EST` / `CR` / `CN` / `DN` / `DC`) | applying a custom prefix to every type — a tax invoice and an estimate would then both resolve to `{prefix}/{FY}/0001` and trip the `(business_id, number)` unique index | [[decision/phase-2-plan]] |
| E-way bill | Optional `eway_bill_number` text on invoices — recorded, not generated (e-way-bill generation is post-V1) | — | [[decision/phase-2-plan]] |
| HSN tax summary | Rendered on the invoice PDF — taxable value + tax grouped by HSN + rate; derived from line items, not stored | a stored summary table | [[decision/phase-2-plan]] |
| Transport fields | Optional transport mode + vehicle number on the invoice | — | [[decision/phase-2-plan]] |
| Invoice terms | Business-level default T&C text (late-payment interest, jurisdiction…), printed on the invoice PDF; per-invoice override optional | — | [[decision/phase-2-plan]] |
| Invoice types | `tax_invoice`, `estimate`, `cash_receipt`, `credit_note`, `debit_note`, `delivery_challan` (non-GST goods-movement note) | — | [[customer/hardware-shop-owner]] |
| Amount in words | Rendered on the invoice PDF; derived at render time, not stored | a stored words column | [[decision/phase-2-plan]] |

## Product — Invoice design & branding  (Phase 2C)

Every fact below is *binding once 2C is in flight*; deviations require a
DECISIONS update first. Rationale + LLD: [[decision/invoice-design-system]].
Competitor pressure: [[competitor/mybillbook]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| V1 template set | Two: `modern`, `classic`. Each = a React component in the PDF microservice with Inter embedded as base64 (no CDN — print determinism). `thermal_80` is cut from V1 → lands in 2C.5 | a web-font CDN; user-uploaded HTML templates; per-invoice template override (V1 is per-business default) | [[decision/invoice-design-system]] |
| Default template | `modern` — Inter, brand-colour accents, minimal borders. Reads cleanest on a phone screen, where 90% of WhatsApped invoices are opened | making `classic` default ("looks more authoritative" is a print-era reflex; the loop's read-surface is a phone) | [[decision/invoice-design-system]] |
| Branding free vs paid | Logo + brand colour + font + both V1 templates ship on the **Free** plan. Paid tiers unlock festive/themed templates (2C.5), column-toggle visibility, and footer removal | gating logo/colour/font behind paid (the trust moment is Day-1; you cannot earn retention through a paywall on the basics) | [[decision/invoice-design-system]] |
| Free-plan PDF footer | "Made with AstraBill" rendered at 8pt grey, centred, at the bottom of every PDF page on the Free plan. Removed on paid plans | banner-sized branding; logos on the footer; mid-page watermarks | [[decision/invoice-design-system]] |
| Branding font set | Four: `inter` (default), `poppins`, `noto_serif`, `noto_sans` (the last includes Devanagari so a Hindi business name renders correctly). Each template declares which it uses; the picker is global per business | a fifth "ornate" option (Playfair / display serifs) in V1 — choice overload; festive themes carry that buyer segment in 2C.5; web-font CDNs for any font | [[decision/invoice-design-system]] |
| Branding columns on `businesses` | `logo_url` (already in schema), `brand_color` text (hex; `/^#[0-9a-fA-F]{6}$/`), `brand_font` text (one of the four), `invoice_template_id` text (one of the two; Zod-validated, not a pg enum — 2C.5 templates add without a migration), `invoice_settings` jsonb (column-visibility flags; default shows HSN / discount / GST / secondary-qty, hides the pharma columns batch / MFG / EXP) | per-invoice template override (V1); snapshotting branding into invoice rows at finalise (V1 re-renders from current branding — historical PDFs change look on theme change; tradeoff accepted) | [[decision/invoice-design-system]] |
| Logo upload | Cloudinary signed direct-upload from the browser. New endpoint `POST /api/uploads/signature` returns timestamp + signature + folder restriction `astrabill/{businessId}/logos`. Browser uploads, then PATCHes `/api/businesses/{id}` with `logo_url`. Server validates URL host against Cloudinary whitelist | proxying uploads through Next.js (memory + bandwidth cost); accepting arbitrary URLs on the PATCH | [[decision/invoice-design-system]] |
| Branding settings UI | New route `/settings/branding` under `AppShell`, tabs: Template · Colors · Font · Columns. Right pane is a live-preview iframe at `/i/preview?...` rendering the user's most-recent finalised invoice with current branding | a drag-and-drop builder like myBillBook's column-toggle canvas (a few well-crafted defaults beat one generic template + a builder) | [[decision/invoice-design-system]] |

## Product — App shell & navigation  (Phase 2D)

Phase 2D makes the app feel like the owner's billing dashboard, not
AstraBill's — the parallel "make it theirs" move to 2C, on the chrome
side. Rationale + LLD: [[decision/white-label-app-shell]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Business-scoped routing | Every business-scoped page lives under `/b/[businessId]/...`. The active business is the URL itself — bookmarkable, explicit, two tabs = two businesses works | a session-stored "active business"; `?businessId=` query params in new pages (legacy 2A pages collapse to `/b/[id]/...` during Step 2 of 2D) | [[decision/white-label-app-shell]] |
| Membership resolution | Resolved exactly ONCE per request in `app/b/[businessId]/layout.tsx`. Nested pages trust the layout and never re-check; repository-level `business_id` scoping stays as defence in depth | duplicating the membership check in every page | [[decision/white-label-app-shell]] |
| Non-member response | 404 (Next's `notFound()`). Same response for "doesn't exist" and "exists but not yours" — no existence leak. Mirrors the repository pattern in [[decision/database-and-rbac]] | a 403 / "Forbidden" surface — it would leak that the business id is valid | [[decision/white-label-app-shell]] |
| `/dashboard` behaviour | Smart redirect — no business → `/onboarding`; ≥1 business → `/b/[mostRecent]/dashboard`. "Most recent" = most-recently-joined membership in V1; tracking `users.last_business_id` (most-recently-used) is the follow-up | a business-picker UI at `/dashboard` (the picker now lives in the sidebar BusinessSwitcher) | [[decision/white-label-app-shell]] |
| Branded chrome strategy | **Subtle**. Brand colour shows on (1) a 2px left-edge accent on the active nav item, (2) the business-avatar fallback background. Everything else uses the neutral `--sidebar-*` token palette | painting the sidebar background in `business.brandColor` (gaudy at saturated user-picked colours; contrast budget breaks); reusing AstraBill blue as the active-item indicator (the *business* should be the brand) | [[decision/white-label-app-shell]] |
| "Powered by AstraBill" mark | Centre-bottom of the sidebar wordmark at 10px / 70% opacity. Visible to the owner, invisible across a counter. Carried on **both** free and paid plans — only the *customer-facing* PDF footer mark is plan-gated | banner-sized; in the page header; removed on paid plans (we never sold removal of the in-app mark) | [[decision/white-label-app-shell]] |
| URL helpers | `lib/routes.ts` is the SSOT for URL structure. The `routes.b(businessId)` factory returns the family of business-scoped URLs in one go (sidebar emits five — pulling the factory once beats threading the id five times) | string-templating paths in JSX (`/b/${id}/invoices`); duplicating URL shape across files | [[decision/white-label-app-shell]] |

## Product — Payment recording

Manual payment recording against invoices — the mechanism behind the V1
udhaar tracker, and the keystone the dashboard KPIs + customer-udhaar view
depend on. Rationale + LLD: [[decision/payment-recording]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| `amount_paid` is derived | `invoices.amount_paid` is **always** recomputed as `SUM(payments.amount WHERE deleted_at IS NULL)` — the payment rows are the single source of truth; the invoice column is a derived cache | `UPDATE … SET amount_paid = amount_paid + :x` (an incrementally-mutated counter drifts and can't self-check) | [[decision/payment-recording]] |
| Status derivation | Payment status follows the sum: `amount_paid >= total` → `paid` (+ `paid_at`); `0 < amount_paid < total` → `partially_paid`; `amount_paid == 0` → `sent`. Computed in one pure function, after every record/void | a client-supplied status; storing status independently of the sum | [[decision/payment-recording]] |
| Payments need a finalised invoice | A payment can only be recorded against `status != 'draft'`. A draft has no number and a still-mutable total — money against a moving total is meaningless | recording a payment on a draft | [[decision/payment-recording]] |
| Concurrency | Record + void both lock the invoice row `FOR UPDATE` before re-summing, so two concurrent payments serialise and the sum can't lose a row | re-summing without the lock (READ COMMITTED lets each tx miss the other's uncommitted row) | [[decision/payment-recording]] |
| Voiding a payment | A void is a **soft delete** (`deleted_at`) + recompute. The row stays; the audit log keeps both `payment.record` and `payment.delete`. Correcting a mis-keyed payment = void + re-record | editing a payment in place; hard-deleting it (both erase that a wrong figure was entered) | [[decision/payment-recording]] |
| RBAC | `payment:record` = owner / admin / accountant; `payment:delete` = owner / admin. A salesman collecting cash cannot record it in V1 — recording is an accountant-grade action | giving salesman `payment:record` without a deliberate decision | [[decision/database-and-rbac]] |

## Product — Public invoice share

The customer-facing read surface — `/i/[shareToken]` + its PDF download —
that the WhatsApp button URL points to. Rationale + LLD:
[[decision/public-invoice-share]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| URL pattern | `/i/[shareToken]` — **locked** by the Meta template button base URL (`https://www.astrabill.com/i/`) + the share_token appended. Meta's URL-button mechanism *appends* the variable value, it does not substitute — the base URL field never contains `{{1}}`. Changing the base invalidates every already-sent invoice link and requires a new Meta template version | `/i/{uuid}`; rotating the path shape after templates approve; typing `{{1}}` into the URL field | [[decision/public-invoice-share]] |
| Share token | 16-char URL-safe random — `randomBytes(12).toString("base64url")`, ~96 bits of entropy. Stored in `invoices.share_token`, unique. Stamped on at finalise alongside the invoice number, one transaction | the invoice UUID as the public identifier; a sequential / guessable handle; a signed JWT (over-engineering — entropy IS the auth) | [[decision/public-invoice-share]] |
| Token nullability | Nullable column. Drafts have `share_token IS NULL`; the row gets a token the moment it's finalised | generating a token at draft create (drafts may never be issued); a NOT NULL constraint that would block adoption for existing finalised invoices | [[decision/public-invoice-share]] |
| Auth model | The token IS the auth. The public page + the public PDF endpoint do NO membership check, NO `requireUser`. Anyone with the URL sees the invoice, by design | wrapping the public page in `requireUser`; rate-limiting in v1 (acceptable; entropy + obscurity are enough); signed query strings on top of the token | [[decision/public-invoice-share]] |
| Unscoped repo reads | `findBusinessById` and `findCustomerById` (no membership filter) are the ONLY repository helpers callable from the public path. Named `find*` (vs `get*ForUser`) to signal the semantic difference; explicit comments warn against general use | calling the auth-scoped repo helpers and "pretending" a system user; inlining raw SQL in the public service to bypass the convention | [[decision/database-and-rbac]] |
| SEO | Pages set `robots: { index: false, follow: false }` in `generateMetadata`; `robots.ts` also disallows `/i/`. Both layers because Google sometimes indexes `robots`-blocked pages via inbound links — the meta tag is the harder block | relying on `robots.txt` alone | [[decision/public-invoice-share]] |
| Plan-gated mark | A small "Made with AstraBill" link sits below the invoice card **only on the free plan** — same rule as the PDF footer ([[decision/invoice-design-system]]). The customer-facing surface is the customer-facing surface, regardless of medium | a different gating policy for web vs PDF | [[decision/public-invoice-share]] |

## Product — WhatsApp invoice send  (Phase 2B)

The "Send on WhatsApp" loop for a finalised invoice. The button on the
invoice detail page posts to `POST /api/invoices/[id]/send-whatsapp`, which
calls the `astrabill_invoice_v1` template and delivers the share-link URL.

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Template | `astrabill_invoice_v1` — Utility, English (`en`), text body + 1 dynamic URL button. **Approved 2026-05-20** by Meta (Active - Quality). The body has 4 variables; the URL button **base** is `https://www.astrabill.com/i/` and Meta **appends** the variable value (the share_token) at the end — Meta's URL buttons append, they do not substitute. v1 supersedes v0, which had its URL incorrectly typed with `{{1}}` inline (Meta concatenated rather than substituted, producing broken links) | hard-coding template content elsewhere; sending without going through the template; typing `{{1}}` into the URL field (only the base goes there) | [[decision/whatsapp-meta-api]] |
| Body variable order | `{{1}}` = customer name · `{{2}}` = invoice number · `{{3}}` = business name · `{{4}}` = amount (raw "1442.00", no `₹` — the template provides it). Order is locked by the approved template | reordering body vars without a new template submission | [[decision/whatsapp-meta-api]] |
| Button variable | URL button index 0, `{{1}}` = `invoices.share_token`. The full URL Meta delivers is the public `/i/[shareToken]` view | sending the invoice UUID; sending the authed URL | [[decision/public-invoice-share]] |
| Send entrypoint | One service: `sendInvoiceOnWhatsApp(invoiceId, actorUserId)`. The route is a thin POST. The service owns membership scoping, permission check, finalised-only guard, customer-phone guard, lazy share_token backfill, log row insert, the Meta call, and the success/failure mark | branching the binding from route or UI; calling the provider from anywhere other than this service | [[decision/whatsapp-meta-api]] |
| Send permission | `whatsapp:send` — owner / admin / accountant / salesman. Viewer cannot send. Salesman CAN send (it's an outbound customer action, not a profit-data action) | giving viewer send; gating send on `payment:record` | [[decision/database-and-rbac]] |
| Drafts cannot send | `status='draft'` invoices have no number — refused with a 409. Finalise first | sending a draft (template body would be malformed) | — |
| No-phone refusal | If `customers.phone` is NULL the send is refused with a 422. UI surfaces it as "Add a phone number" before the user can click Send | sending to a placeholder phone; silently no-op'ing | — |
| Lazy share_token backfill | An invoice finalised before Phase 2B has `share_token IS NULL`. The first send generates and persists a token via a conditional UPDATE (`WHERE id = ? AND share_token IS NULL`) — race-safe against concurrent clicks. Once non-null the token never changes | running a one-off migration script (the on-demand path is enough); generating a fresh token per send (would invalidate already-printed URLs) | [[decision/public-invoice-share]] |
| Send log | Every send writes a `whatsapp_messages` row — queued on insert, then `sent` (with Meta wamid) or `failed` (with error). Rows are **immutable** — no soft-delete column, no edit. The history list IS the audit | editing a row to "fix" a status; re-using a row across resends | — |
| Resend semantics | "Resend" is just another POST that writes a new `whatsapp_messages` row. No server-side debouncing or rate limit in v1; the UI shows a confirm dialog | reusing the previous wamid; merging "send" + "resend" into a different flow | — |
| Variable sanitisation | Body var text is normalised at the transport boundary (`/\s+/g → ' '`, trim) so customer / business names with paste-induced newlines or tabs don't trip Meta's #131008. The stored value is left alone — this is transport-only | sanitising on write (loses fidelity); skipping it (random sends will fail) | — |
| Failure UX | The panel renders inline status (badge + history list) and shows the failed row's error message — same convention as `PaymentPanel`. No global toast in v1 | layering a toast library only for this one feature | — |

## Product — Pricing

| Plan | Price | Key limits | Rationale |
|------|-------|-----------|-----------|
| Free | ₹0 | 20 invoices/month, no WhatsApp send | [[concept/pricing-model]] |
| Starter | ₹499/mo (₹4,999/yr) | WhatsApp send incl. 200/month | [[concept/pricing-model]] |
| Pro | ₹999/mo (₹9,999/yr) | WhatsApp 1,000/month, auto-reminders, multi-user | [[concept/pricing-model]] |
| Business | ₹1,999/mo (₹19,999/yr) | unlimited WhatsApp, multi-location, full RBAC | [[concept/pricing-model]] |

WhatsApp sends above plan cap: ₹0.20/message. Billing preference: annual.
