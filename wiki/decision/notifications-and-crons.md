---
type: decision
updated: 2026-05-17
sources: 0
---

# Notifications, Crons, and Background Jobs

## The Solo Dev Reality

As a solo dev, every background system you add is a system you maintain alone at 2am when it breaks. The principle: **use the simplest thing that works, not the most impressive thing.**

## Job Architecture

Two distinct mechanisms, each doing one job:

- **Scheduling** — `node-cron` running in the DO worker process. Fires job
  functions on a schedule (every 15 min, daily 9am, etc.). Simple, in-process,
  nothing to maintain. Each job function queries the DB for what it needs.
- **WhatsApp send queue** — BullMQ + Redis. Needed because WhatsApp sends
  require rate limiting, retries on failure, and deduplication.

There is no separate `jobs` table. node-cron triggers the work; jobs read
current state straight from the DB. Keep it simple — solo dev maintains this.

## The Full Cron/Job Map

### Real-time (webhook-triggered, not cron)
| Trigger | Action |
|---------|--------|
| Razorpay payment webhook | Mark invoice PAID, send receipt WhatsApp, update udhaar |
| Meta `message.delivered` webhook | Update `whatsapp_messages.delivered_at` |
| Meta `message.read` webhook | Update `whatsapp_messages.read_at`, show "Seen" in udhaar |

### Frequent (every 5-15 minutes on DO)
| Job | Logic |
|-----|-------|
| Process WhatsApp send queue | BullMQ worker: dequeue, send via Meta API, update status |
| Mark overdue invoices | `UPDATE invoices SET status='overdue' WHERE due_date < now() AND status='sent'` |

### Daily (9am IST, cron on DO)
| Job | Logic |
|-----|-------|
| Payment reminders D+3 | Find invoices sent 3 days ago, unpaid → enqueue WhatsApp reminder |
| Payment reminders D+7 | Same for 7 days |
| Payment reminders D+14 | Same for 14 days (final firm reminder) |
| Morning udhaar digest | Pro feature: "Good morning {owner}, ₹{total} outstanding from {n} customers" |
| Low stock alerts | Find products below threshold → notify owner via in-app + WhatsApp |

### Monthly (1st of month, 8am IST)
| Job | Logic |
|-----|-------|
| GSTR filing reminder | "Your GSTR-1 is due on 11th. Your data is ready to download." |
| Monthly business summary | Invoice count, total billed, collected, outstanding (in-app notification) |

### Cleanup (daily, 3am IST)
| Job | Logic |
|-----|-------|
| Old webhook logs | Keep 90 days, purge older |

(OTPs need no cleanup job — they live in Redis with a 5-min TTL and auto-expire. See [[decision/auth-strategy]].)

## Notification Channels

| Type | Channel | When |
|------|---------|------|
| Invoice PAID | In-app + WhatsApp to owner | Real-time, webhook |
| Invoice SEEN by customer | In-app only (subtle, in udhaar list) | Real-time, webhook |
| Payment reminder to customer | WhatsApp only | Cron D+3/7/14 |
| Low stock alert | In-app + WhatsApp to owner | Daily cron |
| OTP | WhatsApp | On demand |
| GSTR reminder | In-app + WhatsApp | Monthly cron |
| Daily udhaar digest | WhatsApp (Pro only) | Daily 9am |

### In-app notifications

PWA push notifications via the **Web Push API** (service worker). Works on Android Chrome and desktop. On iOS Safari 16.4+ with PWA installed, push works too.

No additional service needed — Next.js service worker + Supabase Realtime for live updates.

```typescript
// When invoice is marked PAID by Razorpay webhook:
// 1. Update DB
// 2. Supabase Realtime broadcasts to owner's open browser tab (instant)
// 3. If browser not open: send Web Push notification via service worker
// 4. Send WhatsApp receipt to customer
```

## Code Structure for Crons (Maintainable as Solo Dev)

```
/apps/worker/                  ← separate Node.js service on DO
  src/
    jobs/
      mark-overdue.job.ts      ← one file per job
      payment-reminders.job.ts
      low-stock-alerts.job.ts
      gstr-reminder.job.ts
      cleanup.job.ts
    queues/
      whatsapp.queue.ts        ← BullMQ queue definition
      whatsapp.worker.ts       ← BullMQ worker (processes queue)
    scheduler.ts               ← registers all crons with node-cron
    index.ts                   ← entry point
```

Each job file exports one function. The scheduler calls them:

```typescript
// scheduler.ts
import cron from 'node-cron'
import { markOverdueJob } from './jobs/mark-overdue.job'
import { paymentRemindersJob } from './jobs/payment-reminders.job'

cron.schedule('*/15 * * * *', markOverdueJob)        // every 15 min
cron.schedule('0 9 * * *', paymentRemindersJob, {     // daily 9am IST
  timezone: 'Asia/Kolkata'
})
```

Each job is:
1. **Idempotent**: running it twice has the same result as once
2. **Logged**: structured log at start, end, and on error
3. **Alerting**: on failure → PostHog `captureException` (see `DECISIONS.md`)

## Error Alerting (Non-Negotiable)

Every unhandled exception — in the Next.js app and the DO worker — must
surface, not fail silently. When a cron job crashes quietly, you find out
three days later when a user complains. The tool is **PostHog** (analytics +
error tracking in one — see `DECISIONS.md` → "Analytics + error tracking";
Sentry is deferred).

```typescript
// In every job:
try {
  await markOverdueJob()
} catch (err) {
  posthog.captureException(err, { job: "mark-overdue" })
  logger.error({ job: "mark-overdue", err }, "Job failed")
}
```

## Deduplication (Critical)

Payment reminders must not send twice. Track in DB:

```typescript
// whatsapp_messages table tracks all sends
// Before sending a D+7 reminder:
const alreadySent = await db.query.whatsappMessages.findFirst({
  where: and(
    eq(whatsappMessages.invoiceId, invoiceId),
    eq(whatsappMessages.templateName, 'astrabill_reminder_d7_v1')
  )
})
if (alreadySent) return  // skip — already sent
```

No reminder gets sent twice. No angry customer getting 5 reminders.

## Related Pages

- [[decision/whatsapp-meta-api]] — template names used in reminders
- [[decision/infrastructure]] — DO droplet runs the worker
- [[decision/payment-gateway]] — webhook triggers real-time updates
