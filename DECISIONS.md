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
| File storage | Supabase Storage | — | [[decision/infrastructure]] |

## Auth

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Auth provider | NextAuth v5 (AuthJS), credentials provider | Supabase Auth | [[decision/auth-strategy]] |
| OTP channel | WhatsApp (Meta API), authentication template | SMS | [[decision/auth-strategy]] |
| OTP storage | Redis — SHA-256 hash, 5-min TTL, single-use | DB table (`otp_codes` does NOT exist) | [[decision/auth-strategy]] |
| Session storage | Supabase DB via DrizzleAdapter, JWT strategy | Supabase Auth sessions | [[decision/auth-strategy]] |
| Fallback login | Google OAuth (secondary provider) | — | [[decision/auth-strategy]] |

## Data Model & Access

| Area | Decision | Never | Rationale |
|------|----------|-------|-----------|
| Multi-tenancy | One user → many businesses via `business_members` join table, role per business | global roles | [[decision/database-and-rbac]] |
| Roles | owner, admin, accountant, salesman, viewer | — | [[decision/database-and-rbac]] |
| RBAC | TypeScript service layer (`lib/rbac.ts`) | RBAC logic in SQL | [[decision/database-and-rbac]] |
| Tenant isolation | Repository layer — every query scopes by `business_id` | RLS (broken under NextAuth: `auth.uid()` is NULL; privileged role bypasses RLS) | [[decision/database-and-rbac]] |
| `business_id` placement | On every table, including child tables (line items, payments, stock movements, whatsapp messages) | — | [[decision/database-and-rbac]] |
| V1 tables | 10 business tables + `accounts` (NextAuth Google OAuth) = 11. No `sessions` (JWT), no `verification_token` (no email magic links), no `otp_codes` (Redis) | `otp_codes`, `sessions`, `verification_token` | [[decision/v1-scope]] |

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
