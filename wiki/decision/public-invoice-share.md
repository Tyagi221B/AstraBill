---
type: decision
updated: 2026-05-19
sources: 0
---

# Public Invoice Share

The customer-facing read surface — `/i/[shareToken]` + its PDF download — that
the WhatsApp button URL points to. Binding facts live in `DECISIONS.md`
("Product — Public invoice share"); this page is the *why*.

## Why a separate share token, not the invoice UUID

The tempting shortcut: use `invoices.id` (a UUID) as the public identifier
— `/i/{uuid}`. Rejected for one specific reason and one general one.

**Specific:** Exposing the row primary key in a customer-shared URL gives
anyone with one URL a *probe surface* for the table. Even with random UUIDs
guessing adjacent ids is astronomically unlikely, but the operational habit
of "internal id ≠ public id" is the right default. Other invoices in the
same business are no longer one URL-edit away from a fishing attempt.

**General:** The internal id and the share handle have different lifecycles.
An invoice can be soft-deleted; its share link should die with it. The
share handle can also be rotated independently (a future "revoke link"
feature) — UUIDs can't be rotated, they ARE the row.

## Why 16 chars of base64url (≈ 96 bits)

12 random bytes encode to exactly 16 base64url characters with no padding.
That gives ~96 bits of entropy — well past the brute-force threshold; even
a billion guesses a second on a billion-CPU cluster wouldn't dent it on the
scale of the universe. URL-safe alphabet (`A-Za-z0-9-_`) drops into a path
segment without escaping. Shorter than a UUID (16 vs 36 chars), looks
cleaner in a WhatsApp message preview.

## Why the URL pattern is now LOCKED

The Meta-approved WhatsApp template (`astrabill_invoice`) has a URL button
hard-coded to `https://www.astrabill.com/i/{{1}}`. Once Meta approves a
template, its URL pattern is frozen — changing it requires submitting a new
template version and re-review. So `/i/[shareToken]` is a binding URL
contract. Any future migration of the public-view route would invalidate
every already-sent invoice link AND require a new Meta template.

This is why this work landed **before** the WhatsApp send code: the URL
pattern locks in stone at the moment the template is submitted, so we
needed the route to exist + the token format to be set first.

## Why the token IS the auth

No login required, no signed query string, no rate limiting in v1. Anyone
with the URL sees the invoice — by design, it's a share link. This is the
same model Stripe / Razorpay / Calendly use for receipts and event links:
unguessable random handle = the access ticket. The customer can save the
URL, forward it to their accountant, share with anyone who needs it.

A leaked URL is a leaked invoice. Acceptable for v1 — invoices aren't
typically secrets; they're documents the customer already received. A
future "revoke" feature can flip a `revoked_at` flag and 404 the page;
that's a follow-up, not a v1 blocker.

## Why generated at finalise (not at create)

Drafts have neither a number nor a share token. Both are stamped on at
finalise, in the same transaction — so the invariant "any finalised
invoice has a number AND a share token, both immutable from then on"
holds across the lifetime of every issued document.

Generating at create would mean drafts had shareable links — odd, since a
draft is editable and might never be issued. The lazy approach (no token
until first share) was considered and rejected: it spreads the token
generation across two code paths instead of one, and creates a window
where a finalised invoice is "issued but not yet shareable."

## Why repository-level unscoped reads

The repository convention so far is "every query scopes by business_id"
(see [[decision/database-and-rbac]]). The public share path breaks that —
intentionally — because the token replaces the membership check. We added
`findBusinessById` and `findCustomerById` as *named* unscoped reads with
explicit comments saying "DO NOT use this from code paths that need tenant
isolation." The naming (`find*` instead of `get*ForUser`) signals the
semantic difference. Single audit point: anywhere those two functions are
imported is anywhere the public path touches.

## Why `noindex` + `robots.txt` disallow

Search engines should never crawl `/i/[shareToken]`. The page sets
`robots: { index: false, follow: false }` in its metadata as the per-page
guarantee, and `robots.ts` disallows `/i/` site-wide as belt-and-suspenders.
Two layers because Google has historically indexed `robots`-disallowed
pages via inbound links — the per-page meta tag is the harder block.

## Why `Made with AstraBill` plan-gating mirrors the PDF

The same rule that applies to the PDF footer (free plan shows the mark,
paid removes it — see [[decision/invoice-design-system]]) applies here: the
*customer-facing* surface is the customer-facing surface, regardless of
medium. A paid business that pays partly for the un-branded PDF gets the
un-branded web view too. Consistent.

## Status

Shipped 2026-05-19:
- `share_token` column on `invoices` (unique, nullable for drafts).
- `lib/share-token.ts` — `generateShareToken()`.
- `finalizeInvoice` stamps both `number` + `shareToken` in one tx.
- `/i/[shareToken]` page — mobile-first, brand-coloured accent, Download
  PDF CTA.
- `/api/i/[shareToken]/pdf` — public PDF endpoint via the same renderer
  the authed path uses.
- `robots.ts` disallows `/i/`.

Unblocks the rest of Phase 2B: once Meta approves the templates (≈3h ETA
from submission), the only remaining work is the WhatsApp send code +
"Send on WhatsApp" button. Both plug into the now-existing share URL.

## Related

- [[decision/whatsapp-meta-api]] — the send channel this URL is built for
- [[decision/database-and-rbac]] — the scoping convention this path breaks
  on purpose
- [[decision/invoice-design-system]] — plan-gated footer mark, mirrored
  here
- [[decision/phase-2-plan]] — where this slots in the 2B sequence
