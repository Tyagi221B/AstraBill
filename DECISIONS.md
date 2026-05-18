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
| Error alerting | Sentry (free tier) | silent failures | [[decision/notifications-and-crons]] |
| File storage | Cloudinary — invoice PDFs, business logos, customer-facing images. Free tier covers V1; image transforms + Indian CDN built in | Supabase Storage; binaries in Postgres | [[decision/infrastructure]] |
| Supabase scope | Postgres only — no Auth, no Storage, no Realtime, no Edge Functions. We talk to it via the `postgres` driver / Drizzle | calling Supabase JS from the browser; `@supabase/supabase-js` anywhere in the codebase | [[decision/infrastructure]] |
| Transactional email | Loops.so. FROM `hello@astrabill.com` (display "AstraBill"), Reply-To same; sending domain `astrabill.com` authenticated (SPF + DKIM + DMARC) | sending from `asmit@astrabill.com`; `noreply@` for default sends | [[decision/infrastructure]] |

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

## Product — V1 Scope

| Area | Decision | Rationale |
|------|----------|-----------|
| V1 features | (1) GST invoice + PDF, (2) WhatsApp send + UPI payment link, (3) udhaar tracker, (4) basic inventory | [[decision/v1-scope]] |
| First customer | The brother's glass + hardware shop — a **trading business** | [[customer/hardware-shop-owner]] |
| Primary vertical | Trading / retail shops (hardware, glass, building materials) first | [[customer/hardware-shop-owner]] |
| Language | English only in V1; Hindi in V2 | [[decision/v1-scope]] |
| Onboarding | Anonymous invoice creation → phone OTP → paid; no signup wall | [[decision/onboarding-flow]] |
| Kacha/pakka | Support as "Estimate" and "Cash Receipt" — never label it "kacha" | [[customer/hardware-shop-owner]] |

## Product — Pricing

| Plan | Price | Key limits | Rationale |
|------|-------|-----------|-----------|
| Free | ₹0 | 20 invoices/month, no WhatsApp send | [[concept/pricing-model]] |
| Starter | ₹499/mo (₹4,999/yr) | WhatsApp send incl. 200/month | [[concept/pricing-model]] |
| Pro | ₹999/mo (₹9,999/yr) | WhatsApp 1,000/month, auto-reminders, multi-user | [[concept/pricing-model]] |
| Business | ₹1,999/mo (₹19,999/yr) | unlimited WhatsApp, multi-location, full RBAC | [[concept/pricing-model]] |

WhatsApp sends above plan cap: ₹0.20/message. Billing preference: annual.
