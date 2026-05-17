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
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      Supabase    Razorpay   Meta API
    (DB + Storage) (payments) (WhatsApp)
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
- Uploads to Supabase Storage → returns signed URL
- Reuse same droplet as Worker service (co-locate to save $)
- ~$6-12/month for a basic droplet

### Digital Ocean — Worker/Cron Service
- **BullMQ + Redis** for job queuing
- Cron jobs:
  - Every hour: check invoices overdue by D+3, D+7, D+14 → enqueue WhatsApp reminders
  - Daily 9am: send queued payment reminders (rate-limited: 5 messages/sec)
  - Daily 8am: "Good morning" udhaar summary to shop owner (optional, paid feature)
  - Monthly 1st: prepare GSTR-1 data for the previous month → notify owner
- Job queue for WhatsApp sends: retry on failure, rate limiting, deduplication
- Triggered by Vercel API routes too: "send this invoice now" → enqueue → worker sends

### Supabase
- PostgreSQL database (primary datastore)
- Supabase Storage (PDF files, invoice attachments, business logos)
- Supabase Auth or NextAuth with Supabase adapter (decide: Supabase Auth simpler, NextAuth more flexible)
- Row Level Security (RLS) for multi-tenant data isolation — each business only sees their own data
- Realtime subscriptions for live udhaar updates (optional nice-to-have)

## Environment Variables — Clean Split

```bash
# Vercel env
DATABASE_URL=          # Supabase connection string
NEXTAUTH_SECRET=
NEXTAUTH_URL=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
PDF_SERVICE_URL=       # Internal DO URL
WORKER_SERVICE_URL=    # Internal DO URL (or just enqueue via Redis)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Digital Ocean env (same Supabase + Meta creds, plus)
REDIS_URL=
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
| File upload (logo, attachments) | ✅ (to Supabase) | — |

## Related Pages

- [[decision/pdf-generation]] — runs on DO
- [[decision/whatsapp-meta-api]] — messages queued through DO worker
- [[decision/payment-gateway]] — Razorpay webhook received on Vercel
