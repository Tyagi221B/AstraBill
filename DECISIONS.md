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

## Product — Pricing

| Plan | Price | Key limits | Rationale |
|------|-------|-----------|-----------|
| Free | ₹0 | 20 invoices/month, no WhatsApp send | [[concept/pricing-model]] |
| Starter | ₹499/mo (₹4,999/yr) | WhatsApp send incl. 200/month | [[concept/pricing-model]] |
| Pro | ₹999/mo (₹9,999/yr) | WhatsApp 1,000/month, auto-reminders, multi-user | [[concept/pricing-model]] |
| Business | ₹1,999/mo (₹19,999/yr) | unlimited WhatsApp, multi-location, full RBAC | [[concept/pricing-model]] |

WhatsApp sends above plan cap: ₹0.20/message. Billing preference: annual.
