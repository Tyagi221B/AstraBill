---
type: decision
updated: 2026-05-19
sources: 0
---

# Payment Recording

Manual payment recording against an invoice — the mechanism behind the V1
udhaar tracker. Binding facts live in `DECISIONS.md` ("Product — Payment
recording"); this page is the *why*.

## Why this came before the dashboard KPIs

The 2D plan had Step 3 as "real dashboard KPIs" (outstanding ₹, paid this
month). But every one of those numbers is a function of *what's been paid* —
and before this work, nothing ever got paid. An invoice went `draft → sent`
on finalise and stayed `sent` forever; `amount_paid` was always `0`.

So the dashboard, and the customer-detail udhaar view, were both gated on a
payment primitive existing. Payment recording is the keystone: build it, and
real "outstanding" / "paid" / "partially paid" numbers become possible
everywhere. Build the dashboard first and every figure on it is a placeholder.

## Why `amount_paid` is derived, never stored-incrementally

The tempting shortcut: on each payment, `UPDATE invoices SET amount_paid =
amount_paid + :amount`. Rejected. An incrementally-mutated counter drifts —
a failed half-transaction, a double-submit, a voided payment that forgot to
decrement, and the counter no longer matches reality, with no way to tell.

The chosen rule (the `amount_paid` row in `DECISIONS.md`) takes the other
path: the invoice column is a *derived cache* of the payment rows, recomputed
from scratch on every record and every void. The counter cannot drift from
the rows because it is *defined* by them — the same derive-don't-store
discipline as the HSN summary and amount-in-words.

## Why the invoice row is locked `FOR UPDATE`

Two payments recorded against the same invoice at the same instant. Without a
lock, under Postgres READ COMMITTED, each transaction's `SUM()` can miss the
other's not-yet-committed row — both compute `amount_paid` as if they were
the only payment, and the last write wins, silently dropping a payment from
the total.

Locking the invoice row `FOR UPDATE` at the top of record/delete serialises
them: the second transaction blocks until the first commits, then re-sums
and sees both rows. Same pattern `finalizeInvoice` uses to make the FY
number sequence gap-free.

## Why a void is a soft delete, not a hard delete or an edit

A mis-keyed payment (₹5,000 typed as ₹50,000) has to be fixable — an
unfixable typo would be unacceptable. Three options were weighed:

- **Edit the payment in place** — loses the record that a wrong figure was
  ever entered. An invoice's payment history is money history; it should be
  append-and-correct, not rewrite.
- **Hard delete** — same loss, plus it breaks the audit-log entity reference.
- **Soft delete (chosen)** — the payment row stays, `deleted_at` is set, the
  sum excludes it, the audit trail keeps both the `payment.record` and the
  `payment.delete` entries. The history reads truthfully: "₹50,000 recorded,
  then voided; ₹5,000 recorded." Correcting a payment = void + re-record.

Soft delete also matches the codebase-wide rule (mutable business rows carry
`deleted_at`; see [[decision/database-and-rbac]]).

## Why payments only attach to finalised invoices

A draft is not an issued document — it has no number, it can still be edited
or deleted, its total can still change. Recording money against a moving
total is meaningless. Payments are refused on `status = 'draft'`; the invoice
must be finalised first. (UI-side, the panel simply doesn't render on a
draft.)

## Why a full void drops status to `sent`, not `seen` / `overdue`

When every payment on an invoice is voided, `amount_paid` returns to `0` and
the status must go back to a finalised-but-unpaid state. The candidates are
`sent`, `seen`, `overdue` — and we don't store which one it was before the
first payment.

`sent` is the chosen floor. `seen` is re-derivable from public-link view
tracking and `overdue` from the due-date cron — neither of those features
exists yet, and when they do they'll re-assert the correct status on their
own. Reconstructing them from nothing here would be guesswork; `sent` is
honest and safe. (In practice a full void only happens after a record +
void, an edge case.)

## Relationship to Razorpay

`DECISIONS.md` (Integrations) commits to Razorpay — Smart Collect + Payment
Links — for online collection. That is not this. This is *manual* recording:
the shop owner marks "Ramesh paid ₹5,000 cash today." It is the V1 path and
the only path until Razorpay KYC clears.

When Razorpay lands, its webhook becomes just another writer of `payments`
rows — it inserts a row (with `razorpay_payment_id` set), then runs the exact
same re-sum + status recompute. The payment primitive built here is provider-
agnostic on purpose; the gateway is one more source of payment rows, not a
parallel system.

## Status

Shipped 2026-05-19: schema (the `payments` table already existed) → repository
→ service → API (`POST /api/invoices/[id]/payments`, `DELETE
/api/payments/[id]`) → `PaymentPanel` on the invoice detail page.

Unblocked next:
- **Dashboard KPIs** (2D Step 3) — outstanding ₹, paid this month, now real.
- **Customer detail / udhaar view** — "this customer owes ₹X across N
  invoices", now computable.

## Related

- [[decision/database-and-rbac]] — soft-delete rule, the money-as-`numeric`
  discipline, the no-existence-leak 404 pattern this reuses
- [[decision/payment-gateway]] — Razorpay, the future automated writer of
  payment rows
- [[decision/phase-2-plan]] — where this slots against 2B / 2D
- [[decision/white-label-app-shell]] — 2D, whose Step 3 (dashboard KPIs) this
  unblocks
