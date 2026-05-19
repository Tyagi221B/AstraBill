---
type: decision
updated: 2026-05-19
sources: 0
---

# WhatsApp Invoice Send

The "Send on WhatsApp" loop on a finalised invoice — the V1 hero feature
that turns AstraBill from a billing app into a *get-paid* app. Binding
facts live in `DECISIONS.md` ("Product — WhatsApp invoice send"); this
page is the *why*.

## Why the template binding lives in the send service, not the route

The body-variable order, the URL button index, the language code, the
template name — these are all properties of the **approved Meta
template**, not of any one caller. Putting them in `lib/services/whatsapp-send.ts`
gives them exactly one home; the route is a thin POST that knows nothing
about template structure, and the UI is a fetch + a confirm dialog. When
2C.5 adds a second template (e.g. `astrabill_payment_reminder` once it
clears review), the new template gets its own service function with its
own binding — the existing one is not touched. No "WhatsApp helper"
abstraction is invented for two templates; one will be lifted when a
third arrives.

## Why immutable history (no soft-delete on `whatsapp_messages`)

The `whatsapp_messages` rows ARE the audit. A failed send must remain
visible so the operator sees the error and decides to retry. A successful
send must remain visible so the operator can answer "did I send this?"
six weeks later. Editing or deleting a row erases that history — and
since a resend is a *new row*, there's never a reason to mutate an
existing one. The table is therefore intentionally without the
`softDelete` column other tables carry.

## Why no debouncing on resend

A resend is one more `whatsapp_messages` row and one more Meta API call.
Two button clicks one second apart cost ₹0.28 (two utility sends) and
produce a single duplicate WhatsApp message — annoying, not dangerous.
The confirm dialog in the UI is the v1 guard; server-side rate-limiting
arrives when usage volume justifies the complexity. Resending is, in
fact, a load-bearing operation: a customer who didn't see the first
message gets the second one. Making the path *easy* matters more than
making accidental doubles impossible.

## Why we sanitise body vars at the transport boundary

Meta's WhatsApp Cloud API rejects template body variables that contain
newlines, tabs, or runs of 4+ spaces — error code 131008. Customer and
business names are user-entered and routinely contain incidental
whitespace from paste (`"  Om   Glass\nHardware  "`). Two viable spots
to handle it:

1. **On write** (in the customer form) — but then the *stored* value
   loses fidelity. Someone who actually wants `"Om Glass\nHardware"`
   on their invoice PDF (which renders the newline fine) would lose
   it. The form is not the right scope.
2. **On send** — at the transport boundary, where the constraint
   actually exists. The PDF still renders the original text; only the
   four bytes shipped to Meta are normalised.

Choice 2 follows the [[no-juggad-only-proper-fixes]] discipline: the
constraint is Meta's, the fix lives at the Meta layer.

## Why salesman can send but not see profit

The `whatsapp:send` permission sits in the "outbound customer action"
group, not the "money / margin data" group. A salesman on the floor
who wants to fire off a fresh invoice link to a customer's WhatsApp
is doing the right job. The information they expose is the *customer's
own invoice* — nothing the customer doesn't already have a right to
see. This is consistent with the AstraBill RBAC philosophy that
[[competitor/vyapar]] famously gets wrong (salesman can see margins):
the line is drawn at *internal* data, not at *customer-facing*
actions.

## Why we don't render a global toast

Two reasons. First, the page already has a card-based status pattern
in `PaymentPanel`; the user lives at the bottom of the invoice page
when sending, and an inline status update beats a top-right toast
that pulls the eye away from the action. Second, no toast library is
currently wired into the app — adding `sonner` (or building one) for
a single feature is exactly the kind of "abstraction beyond what
the task requires" we'd remove on review. When five features need
ephemeral notifications, we lift it; not before.

## What lazy backfill is, and what it isn't

Before Phase 2B shipped, finalised invoices stored their share-link
identity in nothing — there was no `share_token` column. The 2B
migration added the column nullable; existing rows came in as NULL.

Two ways to handle the NULL rows:

1. **Backfill migration** — UPDATE every finalised row with a
   freshly-generated token in one big statement.
2. **Lazy on first send** — generate + persist on the first
   `sendInvoiceOnWhatsApp` for that row.

Option 2 wins because most pre-2B invoices will *never* be sent on
WhatsApp (they were created before the feature existed; the customer
already has the PDF some other way). Generating tokens for invoices
that don't need them adds rows to the unique-token index for no
reason, and a migration in production is a heavier lift than a
conditional UPDATE per send. The conditional UPDATE is race-safe by
construction (`WHERE share_token IS NULL`), so two concurrent first-
sends can't produce two tokens.

## Related Pages

- [[decision/public-invoice-share]] — the URL the WhatsApp button points at
- [[decision/whatsapp-meta-api]] — the provider abstraction (`IWhatsAppProvider`)
- [[decision/v1-scope]] — V1 feature #2 (WhatsApp send) — this is the page
- [[decision/database-and-rbac]] — where `whatsapp:send` sits in the catalog
- [[decision/payment-recording]] — the inline-status UX pattern this matches
