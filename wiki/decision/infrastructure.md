---
type: decision
updated: 2026-05-17
sources: 0
---

# Infrastructure Architecture

## The Split

```
┌─────────────────────────────────────────────────────────┐
│                        VERCEL                           │
│  Next.js 16 app — frontend + lightweight API routes     │
│  - Pages, UI, auth (NextAuth)                           │
│  - CRUD API routes (invoices, customers, products)      │
│  - Webhook receivers (Razorpay, Meta)                   │
│  - Short-lived, stateless operations only               │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ internal HTTP
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   DIGITAL OCEAN                         │
│  Node.js services — anything Vercel can't do            │
│                                                         │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │  PDF Service    │  │  Worker / Cron Service       │  │
│  │  Puppeteer +    │  │  BullMQ + Redis              │  │
│  │  full Chromium  │  │  - WhatsApp reminder queue   │  │
│  │  ~$6/mo droplet │  │  - Scheduled cron jobs       │  │
│  └─────────────────┘  │  - GSTR data prep            │  │
│                        │  - Batch invoice sends       │  │
│                        └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                     │
     ┌────────┬──────┴──┬─────────┬─────────┐
     ▼        ▼         ▼         ▼         ▼
  Supabase  Cloudinary Razorpay  Meta API  Loops.so
  (DB only) (files,    (payments)(WhatsApp)(email)
            images,
            PDFs)
```

## Layer Responsibilities

### Vercel — Next.js 16
- All frontend (React, pages, components)
- API routes: create/read/update/delete (invoices, customers, items, businesses)
- NextAuth sessions, RBAC checks
- Webhook endpoint for Razorpay payment events → mark invoice paid
- Webhook endpoint for Meta WhatsApp events → delivery/read receipts
- Calls DO services for heavy work (PDF, queue jobs)

### Digital Ocean — PDF Service
- Single Node.js + Express + Puppeteer process
- Always-on (no cold starts)
- Receives `POST /generate { invoiceData }` → returns PDF bytes
- Uploads to Cloudinary (resource type `raw`) → returns the secure URL
- Reuse same droplet as Worker service (co-locate to save $)
- ~$6-12/month for a basic droplet

### Digital Ocean — Worker/Cron Service
- `node-cron` for scheduling, BullMQ + Redis for the WhatsApp send queue
- Runs all scheduled jobs (overdue marking, reminders, GSTR prep, cleanup)
- Full job map and architecture: see [[decision/notifications-and-crons]]

### Supabase — Postgres only
- PostgreSQL database (the primary datastore — that's it).
- **No** Supabase Auth (see [[decision/auth-strategy]]), **no** Supabase Storage
  (see Cloudinary below), **no** Supabase Realtime, **no** `@supabase/supabase-js`
  anywhere in the codebase. We talk to Postgres via the `postgres` driver /
  Drizzle, full stop.
- No RLS — tenant isolation lives in the repository layer
  (see [[decision/database-and-rbac]]).

### Cloudinary — all file storage
- Invoice PDFs (uploaded by the PDF service), business logos (uploaded from
  the Vercel API when an owner sets up their business), customer-facing
  attachments.
- Why Cloudinary over Supabase Storage / S3:
  - Free tier (25 GB storage, 25 GB bandwidth/mo) easily covers V1.
  - Image transformations (`/w_200,q_auto,f_auto/...`) — logo resizing for
    the invoice PDF, no separate image pipeline.
  - Strong Indian CDN presence.
  - Built-in OCR + AI add-ons we'll likely want for the photograph→invoice
    feature ([[decision/drafts-and-multi-device]]).
- All access through the `IStorageProvider` interface
  ([[decision/code-architecture]]) — Cloudinary is the implementation; the
  call sites don't know.
- Public-asset URLs come back signed/transformable; we never expose the
  Cloudinary cloud-name to a customer-facing URL — the redirect endpoint
  on our domain still fronts everything (see [[decision/pdf-generation]]
  for the PDF case).

### Loops.so — transactional email
- All app-sent email (welcome, paid-plan receipt, plan-limit nudge, CA
  invitation, etc.) goes through Loops's transactional API.
- The sending domain `astrabill.com` is authenticated once (SPF + DKIM +
  DMARC TXT records in the registrar's DNS). After that, any
  `*@astrabill.com` FROM works without per-address auth.
- The canonical FROM / Reply-To is `hello@astrabill.com` (a real, monitored
  Zoho mailbox), display name "AstraBill". `asmit@astrabill.com` is the
  founder's inbox and is never used as a FROM for app email — it conflates
  personal with system. `noreply@` is reserved for purely automated
  high-volume sends we add later; never the default.
- WhatsApp remains the primary channel for invoice delivery + OTP. Email is
  a secondary surface (notifications, recovery, CA collaboration) — not a
  channel an Indian SME owner is checking hourly.

## Environment Variables — Clean Split

For the canonical, up-to-date list, see [`.env.example`](../../.env.example) at
the repo root. The shapes are:

```bash
# Vercel
DATABASE_URL=              # Supabase Postgres pooler (port 6543)
DIRECT_DATABASE_URL=       # Supabase Postgres session pooler (5432, for migrations)
AUTH_SECRET=
AUTH_URL=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
UPSTASH_REDIS_REST_URL=    # OTP + rate limit
UPSTASH_REDIS_REST_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
PDF_SERVICE_URL=           # Internal DO URL
SENTRY_DSN=

# Digital Ocean (PDF + worker, shares Cloudinary + Meta creds, plus)
REDIS_URL=                 # TCP endpoint for BullMQ (Upstash supports this too)
CHROMIUM_PATH=/usr/bin/google-chrome-stable
```

## Cost at Launch

| Service | Cost/month |
|---------|-----------|
| Vercel (Hobby/Pro) | $0-20 |
| Digital Ocean Droplet (PDF + Worker co-located) | $6-12 |
| Supabase (Free → Pro) | $0-25 |
| Redis (DO Managed or self-hosted on same droplet) | $0-15 |
| **Total** | **~$6-52/month** |

Start with a $6/month DO droplet. PDF service + Worker + Redis all on it. Scale up when needed.

## What Goes Where — Decision Table

| Operation | Vercel | Digital Ocean |
|-----------|--------|--------------|
| Create invoice (CRUD) | ✅ | — |
| Generate PDF | — | ✅ PDF Service |
| Send WhatsApp message (immediate) | Via DO queue | ✅ Worker |
| Schedule WhatsApp reminders | Enqueue from Vercel | ✅ Worker cron |
| Mark invoice paid (Razorpay webhook) | ✅ | — |
| WhatsApp read receipt (Meta webhook) | ✅ | — |
| GSTR-1 data aggregation | — | ✅ Worker cron |
| User auth / session | ✅ | — |
| File upload (logo, attachments) | ✅ (to Cloudinary) | — |

## Related Pages

- [[decision/pdf-generation]] — runs on DO
- [[decision/whatsapp-meta-api]] — messages queued through DO worker
- [[decision/payment-gateway]] — Razorpay webhook received on Vercel
