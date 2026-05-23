# AstraBill — DECISIONS

The single source of truth for every binding technical and product decision.

**Rules:**
- Every fact appears here EXACTLY ONCE. Decision pages explain the *why*; this file holds the *what*.
- Read this file FIRST in any building session.
- Changing a decision = edit the row here, then grep the wiki for stale copies.
- `wiki/decision/*.md` pages carry rationale only — they must never restate a fact, only link here.

Last reconciled: 2026-05-23 (PR7-A opening balance + ledger-driven Parties list; PR7-B party_categories + Party Settings scaffold; PR7-C GSTIN Get Details — new `gstin_cache` table (migration 0009, cross-tenant shared), `lib/services/gstin/` adapter pattern with Sandbox + Mock implementations + factory + cache-first orchestration, `GET /api/gstin/[gstin]` auth-only route, "Get details" button on the party form auto-fills name + billing address with confirm prompts on overwrite.)

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
| Droplet identity | One DO droplet (`astrabill-prod`, BLR1, 2 GB RAM) runs Caddy + pdf-service via Docker Compose. Public hostname `pdf.astrabill.com` (Cloudflare DNS-only — orange-cloud breaks ACME). Repo at `/opt/astrabill/`, compose at `/opt/astrabill/deploy/`. Deploy = `git pull && docker compose up -d --build pdf-service`. Caddy + Let's Encrypt own TLS automatically | publishing pdf-service ports to the host (only `:80`/`:443` public); orange-cloud proxying through Cloudflare (HTTP-01 challenge fails); a separate container registry (image builds from local source, pinned to checked-out commit) | [[decision/droplet-operations]] |
| Droplet SSH | Key-only root via `PermitRootLogin prohibit-password` + `PasswordAuthentication no`; fail2ban active. Owner's `~/.ssh/id_ed25519` in `/root/.ssh/authorized_keys`. Laptop must use `IdentitiesOnly yes` (else multiple key offerings trip fail2ban). Recovery from a lockout = boot DO Recovery ISO, mount `/dev/vda1` at `/mnt`, edit `/mnt/etc/ssh/sshd_config`, clear `/mnt/var/lib/fail2ban/fail2ban.sqlite3` | `PermitRootLogin no` (also blocks key auth — was the 2026-05-22 lockout); SSHing without `IdentitiesOnly yes` (offers every key, trips fail2ban); leaving the droplet in Recovery ISO boot mode after recovery (every boot starts the rescue env) | [[decision/droplet-operations]] |
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
| Numeric ↔ string boundary | `::text` casts belong on the READ side only — SELECT projections of computed sums / balances, so postgres-js surfaces them as strings at the TS boundary. Write paths (INSERT / UPDATE) pass naked numeric expressions; the column is `numeric` and a `::text`-wrapped value is rejected. The `sql<string>` generic is a TS-side type hint only — it does not emit a SQL cast | wrapping a computed value in `::text` on the write side of an insert/update; using `sql<string>` as a substitute for a SQL cast (it's a type hint, nothing more) | [[decision/database-and-rbac]] |
| Tenant isolation | Repository layer — every query scopes by `business_id` | RLS (broken under NextAuth: `auth.uid()` is NULL; privileged role bypasses RLS) | [[decision/database-and-rbac]] |
| `business_id` placement | On every table, including child tables (line items, payments, stock movements, whatsapp messages, audit log) | — | [[decision/database-and-rbac]] |
| V1 tables | **SUPERSEDED 2026-05-21** — table count expands under the full-ledger pivot. The new schema (drafted in PR1) will include: `businesses` · `business_members` · `parties` · `party_addresses` · `party_bank_accounts` · `party_contact_persons` · `party_categories` · `party_custom_field_definitions` · `party_custom_field_values` · `items` · `item_party_prices` · `item_custom_field_values` · `stock_movements` · `money_accounts` · `documents` · `document_line_items` · `document_additional_charges` · `document_counters` · `payment_entries` · `payment_entry_allocations` · `ledger_entries` · `audit_log` · `whatsapp_messages` · `users` · `accounts` (NextAuth). Final list locked when PR1 lands | `otp_codes`, `sessions`, `verification_token` | [[decision/full-ledger-pivot]] |
| Audit log | `audit_log` table — every data mutation + auth event, written in-transaction from the service layer | DB triggers for audit; fire-and-forget audit writes | [[decision/database-and-rbac]] |
| Deletes | Soft delete (`deleted_at` timestamptz) on mutable business tables; repositories filter `deleted_at IS NULL` by default | hard delete of business data; deleting a finalized invoice (issue a credit note instead) | [[decision/database-and-rbac]] |
| Timestamps | `timestamptz` (UTC) for instants; Postgres `date` for calendar dates (`issue_date`, `due_date`); convert to IST at the display edge | `timestamp` without zone | [[decision/database-and-rbac]] |
| Drafts | Stored as `status='draft'` rows in `documents` (table renamed from `invoices` per the full-ledger pivot; multi-device follows because they're in Postgres). localStorage holds in-session form state during the pre-auth anonymous drive-by only. Drafts have `number = NULL` until finalised | a separate `drafts` table; Redis-held drafts; persistent anonymous storage; cross-device anonymous drafts | [[decision/drafts-and-multi-device]] |
| System seed data | Lives in `lib/db/seed/` as idempotent TS modules (one file per logical seed). `seedSystem(db)` is the single entry point; `npm run db:seed` runs it; `db:migrate` chains it (`drizzle-kit migrate && db:seed`); `db:reset -- --yes` truncates user tables and re-seeds. Migrations carry the *initial* SQL copy for new-environment bootstraps; from then on, evolution happens in the TS module. Adding a 42nd UQC unit = append to `SYSTEM_UNITS`, run `db:seed`. Per-business seeds (default Cash account, Cash Sale party) stay in `lib/services/businesses.ts.createBusiness` — they self-heal at signup | duplicating system data into a new migration when it could go in the seed module; mutating system rows from user-facing services; truncating system tables in `db:reset` (preserve list in `scripts/db-reset.ts`) | [[decision/database-and-rbac]] |

## Integrations

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Payments (V1) | **UPI deep links** — `upi://pay?pa=<business.upi_id>&pn=...&am=<total>&tn=<inv-no>&cu=INR` rendered as a "Pay ₹X via UPI" button + QR code on the public share page (`/i/[shareToken]`) and on the invoice PDF. Money goes peer-to-peer (customer's bank → shop's bank); AstraBill never touches it. Reconciliation is manual — the shop owner sees the bank SMS and uses the existing "Record payment" flow. Zero fees (UPI MDR is 0%), zero KYC, zero gateway onboarding | a payment-gateway integration for V1; AstraBill VPAs; routing money through us; touching customer funds in any form | [[decision/upi-deep-links]] |
| Payments (V1.x) | **Razorpay deferred** — added when a customer needs cards / auto-reconciliation or when public launch demands it. Per-merchant credentials (each business connects their own Razorpay) — never platform-shared, never AstraBill-as-merchant. The `IPaymentProvider` interface is introduced at that point, not before; V1 has no provider abstraction because there is no provider | platform-shared Razorpay (turns AstraBill into the merchant of record — PA license territory + your books absorb their revenue); writing the `IPaymentProvider` interface speculatively without a provider behind it | [[decision/upi-deep-links]] |
| WhatsApp API | Meta Cloud API, direct (existing Opryon Labs WABA) | BSP middleman | [[decision/whatsapp-meta-api]] |
| WhatsApp abstraction | `IWhatsAppProvider` interface | — | [[decision/whatsapp-meta-api]] |
| WhatsApp sender identity | AstraBill's own number (not the shop owner's) | — | [[decision/whatsapp-meta-api]] |
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

## Product — V1 (Full-Ledger Pivot, 2026-05-21)

**This section supersedes the prior "billing loop" V1 framing.** AstraBill is now a full GST books surface (parties + sales + purchases + payments + ledger + inventory + GST returns), not a billing-only loop. Rationale: [[decision/full-ledger-pivot]]. Reference architecture: [[competitor/mybillbook-architecture]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| V1 product surface | Full GST books — 21 must-have features locked: Business setup · Parties (cust + supp) · Items (prod + serv) · Sales Invoice · Purchase Invoice (with Original Inv No.) · Credit Note · Debit Note · Quotation + Convert-to-Invoice · Payment In/Out · Money Accounts (Cash + Bank) · Ledger statement · Basic stock tracking · Doc numbering (per-doc-type, per-FY) · GST classification · PDF render (3 templates) · WhatsApp send · UPI QR · GSTR-1 + GSTR-3B export · Receivables/Payables ageing · Audit log · Cancellation semantics. Build target: 4 months, ship ~21 Sep 2026 (Option B) | shipping a "wedge V1" without Purchases — that loses the full-ledger pivot's point; bundling V1.5 features (Price History, OCR upload, multi-warehouse) | [[decision/full-ledger-pivot]] |
| First customer | The brother's glass + hardware shop — a **trading business** | — | [[customer/hardware-shop-owner]] |
| Primary vertical | Trading / retail shops (hardware, glass, building materials) first | — | [[customer/hardware-shop-owner]] |
| Language | English only in V1; Hindi in V2 | — | [[decision/full-ledger-pivot]] |
| Onboarding wizard | Three-step post-auth wizard: (1) Business setup — name, GSTIN (with Get Details autofill), state, signature, logo; (2) **Numbering seed** — `next_sequence` per doc type for current FY (default 1; lets a mid-year onboarder continue from offline numbering); (3) First party prompt — optional CSV import OR add first customer manually | dumping the user into an empty dashboard with no path; making numbering seed a Settings-only chore (forces backfill) | [[decision/full-ledger-pivot]] |
| Party model shape | Single `parties` table with `type` enum (`customer | supplier`). Type is pure UI metadata — drives the default CTA, nothing else. Ledger is independent of type, computed from `ledger_entries` balance sign | a `"both"` type; a join table for multi-typing; constraining doc creation on party type | [[decision/full-ledger-pivot]] |
| Accounting model | Single-entry per-party with explicit `debit_amount` + `credit_amount` columns on `ledger_entries`. NOT double-entry — no offsetting account row required at schema level. `balance = SUM(debit) − SUM(credit)` per party. Matches myBillBook's CSV-confirmed model | enforcing matching offsetting accounts in V1; mutating party ledger directly (always via a voucher row) | [[memory: astrabill-ledger-model]] |
| Ledger entries table | Single `ledger_entries` table for BOTH party ledgers and money-account ledgers, discriminated by which FK is populated (`party_id` XOR `money_account_id`). Columns: `voucher_type`, `doc_id` (nullable), `debit_amount` / `credit_amount` (one populated), `entry_date`, `narration` | two separate tables; merging debit + credit into a signed amount (loses Indian accounting semantics) | [[decision/full-ledger-pivot]] |
| Inventory in V1 | Included. **Single warehouse** per business. `stock_movements` table tracks in/out per item; current stock = SUM | multi-warehouse (V2); a separate inventory module | [[decision/full-ledger-pivot]] |
| Tax rate storage | `numeric(5,2)` decimal column on line items. UI picks from preset chips (0 / 0.1 / 0.25 / 1.5 / 3 / 5 / 12 / 18 / 28) but stored value is the actual percent | a Postgres enum (slab changes would require a migration); float for tax rate | [[decision/full-ledger-pivot]] |
| Chart of Accounts | Not exposed in V1. Five top-level categories hardcoded in TypeScript constants (Income · Expense · Asset · Liability · Equity). Money accounts are first-class without CoA | a user-customisable CoA in V1 (defer to V2 with P&L / Balance Sheet) | [[decision/full-ledger-pivot]] |
| Document model | One `documents` table for all doc types, discriminated by `doc_type` enum: `sales_invoice` · `estimate` · `delivery_challan` · `credit_note` · `purchase_invoice` · `debit_note` · `quotation` · `proforma_invoice`. Line items, additional charges, T&C, totals all share schema across types | a separate table per doc type (8 near-identical tables); per-type schemas | [[decision/full-ledger-pivot]] |
| Doc number format | Template string with tokens: `{PREFIX}` · `{FY}` (auto-resolves `25-26`) · `{SEQ:N}` (zero-padded). Default per doc type: `{PREFIX}{SEQ:3}`. Owner can switch to `{PREFIX}/{FY}/{SEQ:4}` style. Stored on `document_counters(business_id, doc_type, fy_year, prefix, sequence_template, next_sequence, reset_each_fy)` | a hardcoded number format; per-document number-format override | [[decision/full-ledger-pivot]] |
| Doc number assignment | At finalise (status `draft → unpaid` transition), not at create. FY for the counter is derived from the doc's `doc_date` — backdated docs land in the correct historical FY counter. Sequence counts ONLY finalised rows; abandoned drafts don't burn numbers. `FOR UPDATE` row lock serialises assignment | numbering a draft; deriving FY from `created_at`; counting drafts in the sequence | [[decision/full-ledger-pivot]] |
| Counter seeding (onboarding) | Onboarding wizard collects `next_sequence` per doc type for the CURRENT FY. Default 1. Editable later under Settings → Invoice Settings. Uniqueness constraint on (business_id, doc_type, fy_year, number) catches collisions if owner reduces seed below already-used numbers | a hidden default of 1 with no onboarding ask (forces a 47-bill backfill); allowing reduction below `next_sequence − 1` silently | [[memory: doc-numbering-onboarding-seed]] |
| Per-FY counter reset | Counters auto-reset to 1 on 1 April. Owner can opt out per doc type via `reset_each_fy: false` on `document_counters` → continuous counter across FYs | a global reset toggle (per-doc-type granularity matters: invoices typically reset, internal POs may not) | [[decision/full-ledger-pivot]] |
| Original invoice number (purchases) | `documents.original_doc_number` + `original_doc_date` (both nullable; app-layer required for `purchase_invoice` + `debit_note`). Captures supplier's invoice number — **required for ITC reconciliation** against supplier's GSTR-1 | omitting it (without supplier's number, ITC can't be claimed) | [[decision/full-ledger-pivot]] |
| Doc-to-doc lineage | `documents.source_doc_id` (nullable FK → documents.id) captures: Quotation → Sales Invoice (convert); Sales Invoice → Credit Note (sales return); Purchase Invoice → Debit Note (purchase return). One column carries lineage across all conversion flows | a separate `document_conversions` table; copying line items by value with no back-pointer | [[decision/full-ledger-pivot]] |
| Cancellation matrix | Parties / Items / Categories: soft delete via `deleted_at`. Documents (finalised): `status='cancelled'`, never deleted; ledger rows for that doc get reversed. Documents (draft): hard delete OK. Payment entries: `status='cancelled'`, never deleted; two-leg ledger reversed. Money account: soft delete only if balance is 0 | hard-deleting any finalised doc or payment; soft-deleting a money account with non-zero balance | [[decision/full-ledger-pivot]] |
| Two-leg posting for payments | Every `payment_entries` row creates exactly 2 `ledger_entries` (party leg + money-account leg) in the same transaction. Settlement-discount adds a 3rd write-off leg on the party ledger only | posting one leg without the other (party balance and cash balance drift) | [[decision/full-ledger-pivot]] |
| UPI QR on invoices | Computed at render time from `upi://pay?pa={vpa}&pn={biz}&am={total}&cu=INR&tn={doc_no}` URI, QR-encoded by the PDF service. **Never stored as an image.** Confirmed against myBillBook 2026-05-21 | a `qr_image_url` column; uploading static QR images | [[memory: astrabill-upi-qr-computed]] |
| Signature scope | Business-level by default (`businesses.signature_url`), optional per-document override (`documents.signature_url` nullable). Renders on every doc type that ships an authorisation block | per-user signatures in V1 (owner-only); inline-drawn signatures | [[decision/full-ledger-pivot]] |
| Per-doc-type T&C defaults | Each doc type ships its own default T&C string seeded at business creation (sales: "Goods once sold..."; purchase: empty / buyer-perspective; quotation: validity terms). Editable per business, editable per document. **AstraBill auto-substitutes `[CITY]` placeholder with business city** | reusing one default T&C across all doc types (myBillBook's mistake); leaving `[ENTER_YOUR_CITY_NAME]` placeholder rendered verbatim | [[decision/full-ledger-pivot]] |
| Audit log scope | `audit_log` written in-transaction from the service layer on finalised-doc mutations only: finalise · cancel · payment record · payment void. NOT written on draft mutations (would be noise) | DB triggers; fire-and-forget; full event sourcing on every CRUD | [[decision/full-ledger-pivot]] |
| Items unit model | Each item has ONE `unit_code` (rate-bearing unit). Secondary informational unit lives per LINE ITEM (not per item) — carries the Phase-2A dual-unit pattern (e.g. glass billed per sq.m, counted in pcs). No unit-conversion math | unit conversion tables in V1; multi-unit items | [[customer/hardware-shop-owner]] |
| Items tax-inclusive pricing | `items.price_includes_tax` boolean. When true, line entry back-calculates taxable amount from inclusive price + GST rate. **Test coverage required** — easy to get the back-calc wrong | omitting test coverage on back-calc; storing both pre-tax + post-tax on the item (one must be derived) | [[decision/full-ledger-pivot]] |
| Party CSV import | V1 ships CSV import for parties only. Items + opening-balance import deferred to V1.5 | bulk invoice import (V2); skipping party import (a 200-customer shop won't onboard with manual entry) | [[decision/full-ledger-pivot]] |
| GSTR-1 / GSTR-3B export | V1 ships GSTR-1 (outward supplies — B2B + B2C + HSN summary) and GSTR-3B (summary tile values) as CSV / JSON matching GST portal schema. **Real-world validated** against a known-good invoice manually filed before launch | shipping V1 without GST returns (then we're a billing tool, not books); skipping the portal-validation step | [[concept/gst-compliance]] |
| Reports in V1 | Sales Register · Purchase Register · Party Statement · GSTR-1 export · GSTR-3B summary · Receivables Ageing · Payables Ageing · HSN Summary · Stock Summary. P&L · Balance Sheet · Trial Balance deferred to V1.5 (require CoA) | shipping P&L without CoA (incorrect output); skipping ageing reports | [[decision/full-ledger-pivot]] |
| Indian number formatting | `formatINR(amount)` util — lakhs/crores grouping (₹1,00,000 not ₹100,000). DD/MM/YYYY date format on every user-facing surface. `numberToWords(amount)` helper for "Total in words" GST-mandatory line | Western thousands grouping; YYYY-MM-DD in user-facing surfaces | [[decision/full-ledger-pivot]] |
| Currency scope | INR only in V1. `currency_code` column on documents defaults to `INR` for forward-compat; no UI for switching | multi-currency UI in V1; floating-point amounts | [[decision/full-ledger-pivot]] |
| Schema build sequence | Two PRs: **PR1** = new schema + migration (additive — old `customers` / `invoices` / `products` tables untouched). **PR2** = domain layer rebuild + old-table demolition (atomic delete of old tables + their routes / services / components, after new domain ships). Supabase snapshot taken before PR2 even though we have no users | bundling schema + rebuild + wipe in one PR (unreviewable); deleting old tables before the new domain layer ships | [[decision/full-ledger-pivot]] |
| `stock_movements` rename | New item-bound stock ledger ships in PR1 as `item_stock_movements` (the legacy product-bound `stock_movements` keeps its name + shape so the old domain runs). PR2 atomically drops legacy `stock_movements` and renames `item_stock_movements` → `stock_movements` | extending the legacy table additively (would force the new domain to read/write through a half-old, half-new shape) | [[decision/full-ledger-pivot]] |
| GST rate semantics | On `items` and `document_line_items`: `gst_rate IS NULL` = legally **exempted**; `gst_rate = 0.00` = **nil-rated** (0%); `gst_rate > 0` = taxable. Distinct under Indian GST — exempted and nil-rated appear differently in returns | conflating the two; a separate `is_gst_exempted` flag (two columns to keep in sync) | [[decision/full-ledger-pivot]] |
| Ledger entry invariants | DB-level `CHECK` constraints enforce: (a) exactly one of `debit_amount` / `credit_amount` populated (NULL the other — keeps direction unambiguous), (b) the populated side > 0, (c) exactly one of `party_id` / `money_account_id` populated (every row is one leg of one ledger). Belt-and-braces over service-layer validation | merging debit/credit into a signed amount; allowing 0 in the unused side; trusting service-layer alone for a row that silently corrupts every report | [[decision/full-ledger-pivot]] |
| Party opening balance | Captured on the Party form as `amount + direction (to_collect / to_pay)`. Persisted as a single `ledger_entries` row with `voucher_type='opening_balance'`; to_collect → debit leg, to_pay → credit leg. **Immutable** once the party has any non-opening ledger activity — the service throws `ConflictError`, the UI locks the card. Pre-activity edits are hard-delete-then-insert (the only sanctioned ledger hard-delete; a reversal pair would clutter the statement view for an unactivated party). To Collect / To Pay KPI tiles + Balance column on the Parties list derive from `SUM(debit) − SUM(credit)` over `ledger_entries`, never from a denormalised column | a `parties.opening_balance` column (would duplicate ledger truth and drift); editing opening balance after activity (corrupts audited history); using a reversal pair for pre-activity edits (cosmetic noise, no value) | [[decision/full-ledger-pivot]] |
| GSTIN profile lookup | Vendor-neutral adapter pattern in `lib/services/gstin/` — `GstinLookupAdapter` interface, `SandboxGstinAdapter` (prod, paid API), `MockGstinAdapter` (dev only, no env config). Selected once per process by `factory.ts` based on `SANDBOX_API_KEY` presence. Service layer is cache-first against the new `gstin_cache` table (PK = gstin, **cross-tenant shared on purpose** — GSTIN data is public so two businesses looking up the same one shouldn't both pay the vendor fee; the auth gate on the route is the abuse bound). TTL: 30d for Sandbox/Setu, 1h for mock. On adapter outage with a stale cache row present, return stale-cache with a flag (UI shows hint) — beats refusing the form auto-fill | shipping a single concrete vendor without the adapter seam (every vendor swap becomes call-site changes); per-business caches (multiplies vendor cost N×); refusing to surface stale data on outage (the form auto-fill is the actual UX win — staleness on a typed GSTIN is acceptable) | [[decision/full-ledger-pivot]] |
| Kacha/pakka | Absorbed into the document model: `delivery_challan` (non-GST goods movement) covers kacha-style needs; `sales_invoice` is pakka | labelling anything "kacha" in UI | [[customer/hardware-shop-owner]] |

## Product — V1 Scope (SUPERSEDED 2026-05-21)

The earlier "billing loop" V1 framing (GST invoice + WhatsApp + UPI link + udhaar + basic inventory) is **superseded** by the full-ledger pivot above. Sections below ("Invoice Anatomy", "Payment recording", "Public invoice share", "WhatsApp invoice send") **carry forward** their patterns to the new document model (the `invoices` → `documents` and `customers` → `parties` rename completed in PR2 Step 11, 2026-05-22) — they are NOT discarded, just re-scoped. Specific superseded rows are marked inline.

## Product — Invoice Anatomy

Derived from real Om Glass Enterprises invoices ([[customer/hardware-shop-owner]]).
Shipped in Phase 2A — see [[decision/phase-2-plan]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Dual-unit line items | A line carries a rate-bearing `quantity`+`unit` AND an optional secondary `quantity`+`unit` (informational — glass billed per sq.m, counted in pcs). GST math runs on the rate-bearing pair only | a single unit per line | [[customer/hardware-shop-owner]] |
| Bill-to vs ship-to | Invoice carries an optional ship-to name + address, distinct from the bill-to customer | — | [[decision/phase-2-plan]] |
| Extra charges | Invoice carries a JSONB list of `{label, amount, taxable, gstRate?}`. Taxable charges (cutting, hole, processing) fold into the taxable value **pre-GST**; non-taxable (informal freight, loading) add **post-tax** | a single fixed `freight` column; assuming all charges are post-tax | [[decision/phase-2-plan]] |
| Invoice numbering | **SUPERSEDED 2026-05-21** by the full-ledger pivot's "Doc number format" + "Doc number assignment" rows above. Extended from sales-invoices-only to all 8 doc types with `document_counters` table; template format generalised to `{PREFIX}` / `{FY}` / `{SEQ:N}` tokens | — | [[decision/full-ledger-pivot]] |
| Custom invoice prefix | **SUPERSEDED 2026-05-21**. Replaced by per-doc-type `document_counters.prefix` (owner sets a prefix per doc type — invoice, estimate, credit note, etc. — each is independently namespaced by `(business_id, doc_type, fy_year)` so collision is structurally impossible) | — | [[decision/full-ledger-pivot]] |
| E-way bill | Optional `eway_bill_number` text on invoices — recorded, not generated (e-way-bill generation is post-V1) | — | [[decision/phase-2-plan]] |
| HSN tax summary | Rendered on the invoice PDF — taxable value + tax grouped by HSN + rate; derived from line items, not stored | a stored summary table | [[decision/phase-2-plan]] |
| Transport fields | Optional transport mode + vehicle number on the invoice | — | [[decision/phase-2-plan]] |
| Invoice terms | **SUPERSEDED 2026-05-21** by the per-doc-type T&C defaults row above (each doc type ships its own seeded T&C, not one shared default) | — | [[decision/full-ledger-pivot]] |
| Document types | **SUPERSEDED 2026-05-21**. New list of 8: `sales_invoice` · `estimate` · `delivery_challan` · `credit_note` · `purchase_invoice` · `debit_note` · `quotation` · `proforma_invoice`. `cash_receipt` is no longer a doc type — cash sales are sales invoices with `party_id` pointing to the special "Cash Sale" party (myBillBook pattern) | — | [[decision/full-ledger-pivot]] |
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
| `amount_received` is derived | `documents.amount_received` is **always** recomputed as `SUM(payment_entry_allocations.allocated_amount)` filtered to non-cancelled `payment_entries` — the allocation rows are the single source of truth; the document column is a derived cache | `UPDATE … SET amount_received = amount_received + :x` (an incrementally-mutated counter drifts and can't self-check) | [[decision/payment-recording]] |
| Status derivation | Document status follows the sum: `amount_received >= grand_total` → `paid`; `0 < amount_received < grand_total` → `partial_paid`; `amount_received == 0` → `unpaid`. Computed in one pure function (`statusFromAmounts`), after every payment record / cancel | a client-supplied status; storing status independently of the sum | [[decision/payment-recording]] |
| Payments need a finalised document | A payment_entry allocation can only be recorded against a document whose `status != 'draft'` and `status != 'cancelled'`. A draft has no number and a still-mutable total — money against a moving total is meaningless | recording a payment on a draft; recording against a cancelled doc | [[decision/payment-recording]] |
| Concurrency | Allocation recompute happens inside the same transaction that inserts the `payment_entries` row; the per-document recompute (`refreshDocumentReceiptTx`) reads + writes `documents` in that transaction so two concurrent allocations serialise and the sum can't lose a row | re-summing without the in-tx lock (READ COMMITTED lets each tx miss the other's uncommitted row) | [[decision/payment-recording]] |
| Cancelling a payment | A cancel sets `payment_entries.status='cancelled'` and reverses its two-leg ledger postings in the same transaction; the document then recomputes `amount_received` from non-cancelled allocations. The audit log keeps both `payment.record` and `payment.cancel`. Correcting a mis-keyed payment = cancel + re-record | editing a payment in place; hard-deleting it (both erase that a wrong figure was entered) | [[decision/payment-recording]] |
| RBAC | `payment:record` = owner / admin / accountant; `payment:cancel` = owner / admin. A salesman collecting cash cannot record it in V1 — recording is an accountant-grade action | giving salesman `payment:record` without a deliberate decision | [[decision/database-and-rbac]] |

## Product — Public invoice share

The customer-facing read surface — `/i/[shareToken]` + its PDF download —
that the WhatsApp button URL points to. Rationale + LLD:
[[decision/public-invoice-share]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| URL pattern | `/i/[shareToken]` — **locked** by the Meta template button base URL (`https://www.astrabill.com/i/`) + the share_token appended. Meta's URL-button mechanism *appends* the variable value, it does not substitute — the base URL field never contains `{{1}}`. Changing the base invalidates every already-sent invoice link and requires a new Meta template version | `/i/{uuid}`; rotating the path shape after templates approve; typing `{{1}}` into the URL field | [[decision/public-invoice-share]] |
| Share token | 16-char URL-safe random — `randomBytes(12).toString("base64url")`, ~96 bits of entropy. Stored in `documents.share_token`, unique. Stamped on at finalise alongside the document number, one transaction | the document UUID as the public identifier; a sequential / guessable handle; a signed JWT (over-engineering — entropy IS the auth) | [[decision/public-invoice-share]] |
| Token nullability | Nullable column. Drafts have `share_token IS NULL`; the row gets a token the moment it's finalised | generating a token at draft create (drafts may never be issued); a NOT NULL constraint that would block adoption for existing finalised documents | [[decision/public-invoice-share]] |
| Auth model | The token IS the auth. The public page + the public PDF endpoint do NO membership check, NO `requireUser`. Anyone with the URL sees the document, by design | wrapping the public page in `requireUser`; rate-limiting in v1 (acceptable; entropy + obscurity are enough); signed query strings on top of the token | [[decision/public-invoice-share]] |
| Unscoped repo reads | `findBusinessById`, `findPartyById`, and `getDocumentByShareToken` (no membership filter) are the ONLY repository helpers callable from the public path. Named `find*` / `*ByShareToken` (vs `get*ForUser`) to signal the semantic difference; explicit comments warn against general use | calling the auth-scoped repo helpers and "pretending" a system user; inlining raw SQL in the public service to bypass the convention | [[decision/database-and-rbac]] |
| SEO | Pages set `robots: { index: false, follow: false }` in `generateMetadata`; `robots.ts` also disallows `/i/`. Both layers because Google sometimes indexes `robots`-blocked pages via inbound links — the meta tag is the harder block | relying on `robots.txt` alone | [[decision/public-invoice-share]] |
| Plan-gated mark | A small "Made with AstraBill" link sits below the invoice card **only on the free plan** — same rule as the PDF footer ([[decision/invoice-design-system]]). The customer-facing surface is the customer-facing surface, regardless of medium | a different gating policy for web vs PDF | [[decision/public-invoice-share]] |

## Product — WhatsApp invoice send  (Phase 2B)

The "Send on WhatsApp" loop for a finalised sales invoice. The button on
the document detail page posts to `POST /api/documents/[id]/send-whatsapp`,
which calls the `astrabill_invoice_v1` template and delivers the share-link
URL. V1 restricts send to `doc_type='sales_invoice'`; extending to
quotation / credit_note is a separate decision.

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Template | `astrabill_invoice_v1` — Utility, English (`en`), text body + 1 dynamic URL button. **Approved 2026-05-20** by Meta (Active - Quality). The body has 4 variables; the URL button **base** is `https://www.astrabill.com/i/` and Meta **appends** the variable value (the share_token) at the end — Meta's URL buttons append, they do not substitute. v1 supersedes v0, which had its URL incorrectly typed with `{{1}}` inline (Meta concatenated rather than substituted, producing broken links) | hard-coding template content elsewhere; sending without going through the template; typing `{{1}}` into the URL field (only the base goes there) | [[decision/whatsapp-meta-api]] |
| Body variable order | `{{1}}` = party name · `{{2}}` = document number · `{{3}}` = business name · `{{4}}` = amount (raw "1442.00", no `₹` — the template provides it). Order is locked by the approved template | reordering body vars without a new template submission | [[decision/whatsapp-meta-api]] |
| Button variable | URL button index 0, `{{1}}` = `documents.share_token`. The full URL Meta delivers is the public `/i/[shareToken]` view | sending the document UUID; sending the authed URL | [[decision/public-invoice-share]] |
| Send entrypoint | One service: `sendDocumentOnWhatsApp(documentId, actorUserId)`. The route is a thin POST. The service owns membership scoping, permission check, doc-type guard (sales_invoice only), finalised-only guard, party-mobile guard, lazy share_token backfill, log row insert, the Meta call, and the success/failure mark | branching the binding from route or UI; calling the provider from anywhere other than this service | [[decision/whatsapp-meta-api]] |
| Send permission | `whatsapp:send` — owner / admin / accountant / salesman. Viewer cannot send. Salesman CAN send (it's an outbound customer action, not a profit-data action) | giving viewer send; gating send on `payment:record` | [[decision/database-and-rbac]] |
| Drafts cannot send | `status='draft'` documents have no number — refused with a 409. Finalise first | sending a draft (template body would be malformed) | — |
| No-phone refusal | If `parties.mobile_number` is NULL the send is refused with a 422. UI surfaces it as "Add a phone number" before the user can click Send | sending to a placeholder phone; silently no-op'ing | — |
| Lazy share_token backfill | A document finalised before Phase 2B has `share_token IS NULL`. The first send generates and persists a token via a conditional UPDATE (`WHERE id = ? AND share_token IS NULL`) — race-safe against concurrent clicks. Once non-null the token never changes | running a one-off migration script (the on-demand path is enough); generating a fresh token per send (would invalidate already-printed URLs) | [[decision/public-invoice-share]] |
| Send log | Every send writes a `whatsapp_messages` row (with `document_id` FK) — queued on insert, then `sent` (with Meta wamid) or `failed` (with error). Rows are **immutable** — no soft-delete column, no edit. The history list IS the audit | editing a row to "fix" a status; re-using a row across resends | — |
| Resend semantics | "Resend" is just another POST that writes a new `whatsapp_messages` row. No server-side debouncing or rate limit in v1; the UI shows a confirm dialog | reusing the previous wamid; merging "send" + "resend" into a different flow | — |
| Variable sanitisation | Body var text is normalised at the transport boundary (`/\s+/g → ' '`, trim) so party / business names with paste-induced newlines or tabs don't trip Meta's #131008. The stored value is left alone — this is transport-only | sanitising on write (loses fidelity); skipping it (random sends will fail) | — |
| Failure UX | The panel renders inline status (badge + history list) and shows the failed row's error message — same convention as `PaymentPanel`. No global toast in v1 | layering a toast library only for this one feature | — |

## Product — UI refinement  (Phase 2E)

Visual-polish pass on the in-app UI. Not a redesign — the IA / routes /
flow stay. Refine the *look* until it stops feeling amateurish.
Rationale + scope: [[decision/ui-refinement-phase-2e]].

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Aesthetic target | Zoho-like — light, calm, generous spacing. Restrained colour (brand colour used only on the primary action). Information hierarchy via typography weight, not boxes | Linear-style density (wrong for a 5-minute tool); Vyapar-style colour-and-friendliness (we beat them by being *more* professional, not by matching warmth) | [[decision/ui-refinement-phase-2e]] |
| Default theme | **Light**. Toggle still exposes light / dark / system; explicit choice is persisted. The new-user *first paint* is light | `defaultTheme="system"` (leaks the user's dark-OS preference into a category that's universally light) | [[decision/ui-refinement-phase-2e]] |
| Spacing scale | One documented scale applied everywhere: section 32 / intra-section 20 / form-row 16 / label-to-input 6 / card-padding 20–24 / page-padding 24–32 (desktop). Lives in the `app/globals.css` header comment and the 2E rationale page | ad-hoc spacing per component; introducing a CSS-variable layer when Tailwind's own scale already does the job | [[decision/ui-refinement-phase-2e]] |
| Typography scale | One documented scale: page title `text-2xl font-bold` · section heading `text-base font-semibold` · subsection label `text-xs uppercase tracking-wide text-muted-foreground` · body `text-sm` · money `text-sm font-semibold tabular-nums`. Lives next to the spacing scale | mixing arbitrary `text-[Npx]` for headings; competing weight scales across screens | [[decision/ui-refinement-phase-2e]] |
| Scope discipline | Refinement only — no new features, no flow changes, no new component libraries. The one new primitive is `sonner` toast (lands in Step 3) | bundling new features into a polish pass; introducing shadcn-full or a different design library | [[decision/ui-refinement-phase-2e]] |
| Phasing | Step 0 (foundation: tokens · spacing scale · light default · this doc) → Step 1 (invoice creation form, the headline) → Step 2 (propagate to siblings) → Step 3 (polish: empty states · skeletons · sonner · focus states · mobile) | parallelising Step 1 and Step 2 (Step 1's choices are the template Step 2 propagates) | [[decision/ui-refinement-phase-2e]] |

## Product — Pricing

| Plan | Price | Key limits | Rationale |
|------|-------|-----------|-----------|
| Free | ₹0 | 20 invoices/month, no WhatsApp send | [[concept/pricing-model]] |
| Starter | ₹499/mo (₹4,999/yr) | WhatsApp send incl. 200/month | [[concept/pricing-model]] |
| Pro | ₹999/mo (₹9,999/yr) | WhatsApp 1,000/month, auto-reminders, multi-user | [[concept/pricing-model]] |
| Business | ₹1,999/mo (₹19,999/yr) | unlimited WhatsApp, multi-location, full RBAC | [[concept/pricing-model]] |

WhatsApp sends above plan cap: ₹0.20/message. Billing preference: annual.
