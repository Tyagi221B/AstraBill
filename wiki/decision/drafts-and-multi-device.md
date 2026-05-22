---
type: decision
updated: 2026-05-22
sources: 0
---

# Drafts & Multi-Device — Why Drafts Are Just Documents

For the binding fact (where drafts live, what we don't build), see
`DECISIONS.md` → "Drafts". This page is the rationale.

## What was on the table

Three storage shapes were considered for "where does a document live before
it's been finalised and sent?":

1. **A separate `drafts` table** (or Redis-backed drafts) — drafts are a
   distinct kind of thing from finalised documents.
2. **`documents` rows with `status='draft'`** — drafts ARE documents; the
   only thing that distinguishes them is that they haven't been issued yet.
3. **Client-only (localStorage)** — drafts only live in the browser; on
   "send", we POST the full payload and the server persists for the first time.

## Why we picked (2), with localStorage covering the anonymous edge

### Drafts are documents

The `documents` table carries a `docStatus` enum that includes a `draft`
value. A draft is a document that hasn't been finalised — same columns,
same lines, same GST math, just not yet immutable. The shape applies to
every doc type (sales_invoice, estimate, credit_note, purchase_invoice,
debit_note, quotation, proforma_invoice, delivery_challan). Adding a
parallel `drafts` table would mean:

- Every "list my documents" query unions two shapes.
- "Finalise this draft" becomes a copy across tables — opportunity for the
  two rows to drift.
- Two snapshot stories for line items, two audit stories, two soft-delete
  stories. Two of everything.

That's a textbook second source of truth. Drafts as `documents.status='draft'`
keeps the data model honest.

### Redis is not a system of record

Redis is the right tool for the [[decision/auth-strategy]] OTP and the
[[decision/notifications-and-crons]] WhatsApp queue — ephemeral, fast,
disposable. Drafts are *business data* the owner expects to come back to.
They belong in Postgres, not in a queue/cache layer that loses data on
restart and isn't designed to be queried.

### What about the anonymous window?

The schema requires every document to belong to a business — meaning the
moment a draft exists server-side, the user is already authenticated. So
what holds the form between "user opens AstraBill anonymously" and "user
signs in to send"?

Two options for that window:

- **Server-side anonymous drafts.** Redis with a 24h TTL, claimed after OTP.
  Adds infrastructure, an anti-abuse surface, and the question of who can
  read a draft by `draftId`. Optimises a flow that, in practice, takes about
  five minutes from start to send.
- **localStorage.** The form is just React state plus a thin localStorage
  layer that survives a refresh or back-button. Zero server state for the
  60–70% of anonymous drive-bys who never sign up. Fits the realistic flow.

We picked localStorage. It is **in-session form-state preservation**, not
anonymous persistence — it does not contradict the
[[decision/onboarding-flow]] "no save for anonymous" framing. On sign-in, the
localStorage contents are POSTed once and become a `documents` row; the
local copy is cleared.

## What this gives us for free

**Multi-device drafting.** Once authenticated, a draft is just a row scoped
to the user's business. Opening the app on another device shows the same
draft. No sync code, no conflict resolution — Postgres is the sync.

**A clean substrate for AI features.** The 2026 roadmap (see
[[overview]] differentiation matrix) includes OCR-from-photo, suggested GST
rate, auto-categorised parties. Every one is a service that *writes a
draft `documents` row*. The OCR flow:

```
mobile:   POST /api/documents/from-photo  (image)
          → service runs OCR, persists draft document
          → returns documentId
desktop:  GET /api/documents?status=draft
          → user sees the OCR'd draft and continues editing
          → finalises and sends
```

works without a new table, without a new storage layer. AI features compose
by writing into the schema we already have.

## The UX implication

Because multi-device falls out of being authenticated, *fast sign-in* is the
mechanism — not a clever anonymous-sync system. That aligns with
[[decision/auth-strategy]]: two equal entry doors (Google one-tap or
WhatsApp OTP), pick whichever is faster.

For the rare "I want my anonymous draft on another device" — the answer is
"sign in" (one tap with Google), and from that moment on it works. We do
not engineer for the anonymous cross-device case; the engineering cost
exceeds the user value.

## What we explicitly do NOT build

- A `drafts` table.
- Redis-backed anonymous drafts.
- A QR / short-code mechanism to claim an anonymous draft on another device.
- Any "draft sync" service. Postgres is the sync.

## Related Pages

- [[decision/full-ledger-pivot]] — the `documents` table and `docStatus` enum
- [[decision/database-and-rbac]] — why business data lives in Postgres, not Redis
- [[decision/onboarding-flow]] — the anonymous-then-OTP flow this draft path sits inside
- [[decision/auth-strategy]] — the auth model that makes multi-device automatic
