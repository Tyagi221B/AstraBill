---
type: audit
updated: 2026-05-24
sources: 1
---

# Full Audit — PR7-H surface + MVP-readiness lens (2026-05-24)

Scope: ground-up audit of the PR7-H document-form surface (DocumentForm,
picker modals, atomic firstPayment chain, repo / schema changes) **plus** a
user-perspective MVP-readiness pass against the V1 scope locked in
`DECISIONS.md` row 94 (the 21-feature list).

**No code changes were made.** This file is read-only; act on findings via
follow-up PRs.

Audit gates ran clean: `tsc --noEmit` exit 0, `vitest run` 30/30 pass.

---

## TL;DR — what to fix before shipping

**1 confirmed bug, 3 hardening items, ~7 unshipped V1-scope features.**

| # | Severity | Area | One-liner |
|---|----------|------|-----------|
| B1 | **HIGH** | Party balance | `listPartiesWithBalanceForUser` returns wrong balance after any doc/payment cancellation (shows `-X` instead of `0`) |
| H1 | medium | Schema hygiene | `updateDocumentSchema` silently accepts `firstPayment` on PATCH and discards it — should `.omit()` |
| H2 | low | Layering | Multiple `await import("../db/schema")` inside loops in `documents.ts` — should be top-level imports |
| H3 | low | Redundancy | `getPartyForUserTx` runs twice per `createDocument` w/ firstPayment (once in doc create, once in `recordPaymentTx`) |
| S1 | **scope** | GSTR-1 | Only B2B section shipped; B2C + HSN summary required by V1 scope row 121 |
| S2 | **scope** | Party CSV import | Required by V1 scope row 120; no UI or service found |
| S3 | scope | Quotation → Invoice convert | Service + API route exist; **no UI surfacing the button** on quotation detail |
| S4 | scope | WhatsApp send for non-sales docs | Scope locks send to sales_invoice only in V1 — confirmed shipped correctly |
| S5 | scope | Doc-numbering Settings editor | Onboarding seeds; no Settings → Invoice Settings page to edit later |
| S6 | scope | PDF templates | 2 templates shipped (modern + classic), matches V1 scope ✓ |
| S7 | scope | Inventory low-stock / reorder | Stock summary report exists; no low-stock alerts |

---

## Part 1 — PR7-H surface audit

### Quality summary

PR7-H landed clean. The unification of `SalesInvoiceForm` into `DocumentForm`
removed a near-duplicate; the atomic `firstPayment` chain is well-designed
(see section A below); the picker modals are keyboard-friendly. The form
also recovered correctly from the `numeric(5,2)` ↔ select-value drift
(`normalizeRate` helper at the two boundaries: edit hydrate + picker
append). One real bug surfaced in a non-PR7-H file the work depends on.

### A. Atomic `firstPayment` chain — verified correct

`lib/services/documents.ts:438-470` wraps `finaliseDocumentTx` +
`recordPaymentTx` inside the `createDocument` transaction. Verified:

- ✅ All writes (doc insert, line items, audit, finalise ledger/stock, payment ledger, payment audit) are in **one** `db.transaction(...)` envelope. Any throw rolls back the doc — no orphan rows.
- ✅ Permission gate (`payment:record`) is checked **before** the transaction opens, alongside `document:create`.
- ✅ docType allowlist (`FIRST_PAYMENT_TYPE`) is enforced server-side and matches client `TYPE_CONFIGS.supportsFirstPayment` (sales_invoice + purchase_invoice only).
- ✅ `amount > grandTotal` is rejected after `finaliseDocumentTx` writes the totals — the rollback path is honored.
- ✅ `validatePaymentInput` runs before `recordPaymentTx` so the allocation-sum invariant is checked even on the inline path (matches the standalone payment flow).
- ✅ `getMoneyAccountForUserTx` cross-checks `businessId` so a user can't slip in an account from another business they have access to.

**Concurrency:** `reserveNextNumberTx` issues `FOR UPDATE` on the counter row. Rollback releases the lock AND unwinds the `next_value` increment, so doc numbers stay gapless. Two simultaneous create-with-payment requests serialise correctly.

### B. Real bug: party balance computation after cancellations

**File:** [lib/repositories/parties.ts:144-188](lib/repositories/parties.ts#L144-L188)
**Severity:** HIGH (silent data corruption in the UI)
**Symptom:** After cancelling a finalised sale (or cancelling a payment), the
party row in the picker shows balance `-₹X` (green ↓ "we owe them"), when
the truth is `₹0`.

**Root cause:** `listPartiesWithBalanceForUser` joins `ledger_entries` with
the filter `isNull(ledgerEntries.reversedByLedgerEntryId)`. The intent is
"skip rows that have been reversed." But our reversal pattern (see
`cancelDocument`, `cancelPayment`) **only** sets `reversedByLedgerEntryId`
on the *original* row — the reversal row itself has it NULL. So:

```
original sale:    debit=100, reversedByLedgerEntryId=<set>   → EXCLUDED
reversal:         credit=100, reversedByLedgerEntryId=NULL   → INCLUDED

sum(debit) - sum(credit) = 0 - 100 = -100  ❌
```

Canonical `balanceForParty` in `lib/repositories/ledger-entries.ts:105-116`
uses **no filter** — original (+100) + reversal (-100) net to 0. ✅

**Fix (one-line, NO code change in this audit):** drop the
`isNull(reversedByLedgerEntryId)` clause in
`listPartiesWithBalanceForUser`. Behaviour will then match the canonical
balance function.

**Repro:**
1. Create a customer, finalise a ₹100 sales invoice → picker shows +₹100 ↑ (red).
2. Cancel that sales invoice.
3. Reopen the document form → picker now shows -₹100 ↓ (green). Wrong.

**Blast radius:** balance-driven sort/colour on the Party picker only.
Doesn't affect the books themselves; the Party detail page (which uses
`balanceForParty`) is correct.

### C. Schema hygiene — `firstPayment` on PATCH

**File:** [lib/schemas/document.ts:133-136](lib/schemas/document.ts#L133-L136)

`updateDocumentSchema` is derived as `createDocumentSchema.omit({businessId,docType}).partial({lines,additionalCharges})`. It still
carries `firstPayment` as optional. A buggy / malicious client could POST
`firstPayment` to `PATCH /api/documents/[id]` — and `updateDocument` would
silently drop it without erroring.

The behaviour is documented ("Only honoured on POST (create), ignored on
PATCH (edit)") but a clean API surface should `.omit({firstPayment})` from
the update schema so the boundary rejects it.

Severity: low. Not a security hole — just a footgun.

### D. Layering nits in `lib/services/documents.ts`

- L670, L675, L780, L920: `await import("../db/schema")` inside service bodies. The same module is already imported at the top via `import type {...}`. The dynamic imports look like leftovers from earlier circular-import paranoia. `ledgerEntries` was migrated to top-level (L90) but `documentLineItems` / `documentAdditionalCharges` weren't. Worth consolidating.
- L93: `getPartyForUserTx` import. `createDocument` validates the party at L354. Then `recordPaymentTx` (inside the same tx) re-validates at `lib/services/payment-entries.ts:119`. Redundant but harmless. If you want to drop the second check, only do so behind a clear "caller already validated" comment.

### E. Form / picker UX nits (non-blocking)

- `DocumentForm` `set<K>` helper is fine but doesn't preserve referential equality of sibling props — not a concern at form scale.
- `ItemPickerModal`'s `confirm` reads `selected` from closure; the effect re-attaches the listener on every `selected` change (deps include `[items, selected]`). Works correctly.
- `PartyPickerModal` autoselects newly-created party AND prepends to the picker list — good UX, no duplicate rows since the local list is the source.
- `DocumentForm.tsx:404-406` reads `bankAccountNumber` / `bankIfsc` / `upiId` from `business` — confirmed `BusinessHeaderInfo` carries these typed; no runtime undefined risk now that all 10 pages pass the full `business` object.
- `DocumentForm.tsx:1437` payment panel is correctly hidden on edit (`!isEdit && cfg.supportsFirstPayment`). Aligns with `FIRST_PAYMENT_TYPE` allowlist.

### F. Polish items that didn't ship in PR7-H (not bugs — known)

- Mobile layout for line-items table = horizontal scroll only (per "we'll worry about mobile later" memory). Card-per-line is the future PR.
- No `+ Add Charge` UI for `additionalCharges` (taxable/non-taxable freight, loading, packaging). Server accepts them; UI doesn't surface. Scope deferred. Flagged for the next polish round.
- No bill-level discount (`billLevelDiscount`) input. Server accepts; UI doesn't surface.
- No "Auto-substitute [CITY]" preview in the T&C box — already applied at fetch time by `applyCityPlaceholder` in the page loaders. ✓ correct.

---

## Part 2 — User-perspective MVP-readiness pass

Walked the happy path of the V1 scope (`DECISIONS.md` row 94) feature-by-feature
against the current `app/`, `components/`, `lib/services/` surface. Marker
key: ✅ shipped · ⚠️ partial · ❌ missing.

### V1 must-haves (21)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Business setup | ✅ | `/onboarding` 3-step wizard exists with name/GSTIN/state/city, numbering seed, first party prompt |
| 2 | Parties (cust + supp) | ✅ | `/parties` list + detail + edit · type enum drives default CTA. CSV import — see #20 |
| 3 | Items (product + service) | ✅ | `/items` list + ItemFormModal · PR7-G shipped the form parity |
| 4 | Sales Invoice | ✅ | full create/edit/finalise/cancel · PR7-H polished form |
| 5 | Purchase Invoice (with Original Inv No.) | ✅ | Original supplier inv no/date in DocumentForm header · required for ITC |
| 6 | Credit Note | ✅ | Create/edit/finalise via DocumentForm |
| 7 | Debit Note | ✅ | Create/edit/finalise via DocumentForm |
| 8 | Quotation + Convert-to-Invoice | ⚠️ | Create/edit ✅; **convert UI not surfaced on quotation detail** (see S3 below) |
| 9 | Payment In/Out | ✅ | Standalone modal + inline firstPayment at create (PR7-H) |
| 10 | Money Accounts (Cash + Bank) | ✅ | `/cash-and-bank` list + adjust + transfer |
| 11 | Ledger statement | ✅ | `/reports/party-statement` |
| 12 | Basic stock tracking | ✅ | `stock_movements` written on finalise/cancel · `/reports/stock-summary` |
| 13 | Doc numbering (per-doc-type, per-FY) | ⚠️ | Onboarding seeds ✅; **no Settings → Invoice Settings UI** to edit prefixes/templates later (see S5) |
| 14 | GST classification | ✅ | `classifyTax` intra/inter, exempt vs nil-rated semantics enforced |
| 15 | PDF render (3 templates) | ⚠️ | **2 templates shipped** (Modern, Classic); `thermal_80` cut to 2C.5 per `DECISIONS.md` row 164. If "3 templates" is the hard requirement, this is a scope renegotiation, not a missing build |
| 16 | WhatsApp send | ✅ | sales_invoice only per scope; `WhatsAppPanel` on invoice detail |
| 17 | UPI QR | ✅ | Computed at render time in PDF service (no stored image) |
| 18 | GSTR-1 + GSTR-3B export | ⚠️ | GSTR-1 shows **B2B only** on the report page; scope requires B2B + B2C + HSN summary. HSN has its own report page ✅. B2C section is the gap (see S1) |
| 19 | Receivables/Payables ageing | ✅ | `/reports/receivables-ageing` + `/reports/payables-ageing` |
| 20 | Audit log | ✅ | `audit_log` written in-transaction for create/finalise/cancel/payment-record/payment-cancel |
| 21 | Cancellation semantics | ✅ | Doc cancel writes reversal ledger + reversal stock; payment cancel writes reversal legs |

### Critical scope gaps (S1–S7)

#### S1 — GSTR-1 B2C section missing
Current `/reports/gstr-1` page shows only B2B (`getGstr1B2b` service). GST scope row 121: "B2B + B2C + HSN summary." HSN ✓. B2C ❌. Without B2C the filing is incomplete for any business selling to unregistered consumers — i.e. retail-side trading shops, which is the **primary vertical** (DECISIONS row 96). This is launch-blocking for the first customer.

#### S2 — Party CSV import missing
`DECISIONS.md` row 120: "V1 ships CSV import for parties only." Searched `app/`, `components/`, `lib/services/` — no `parseCSV`, no upload UI, no import route. **A 200-customer shop will not onboard with manual entry** (the very rationale quoted in the decision). Launch-blocking for any shop bigger than ~10 customers.

#### S3 — Quotation → Invoice convert UI
Service `convertQuotationToInvoice` exists ([lib/services/documents.ts:896](lib/services/documents.ts#L896)). API route exists at `app/api/documents/[id]/convert/route.ts`. But `DocumentActions.tsx:128` is where the button *should* trigger it and looking at the file context, only the fetch wrapper is wired — needs a "Convert to Sales Invoice" button on the finalised quotation detail. Quick fix.

#### S5 — Settings → Invoice Settings (doc-numbering editor)
Onboarding wizard step 2 seeds counters. `DECISIONS.md` row 108: "Editable later under Settings → Invoice Settings." `app/b/[businessId]/settings/` contains: `branding`, `item-categories`, `party-categories`, `party-custom-fields`, `payments`. **No invoice-settings page.** Without it, an owner who picks the wrong prefix at onboarding can't change it.

#### S7 — Low-stock alerts
Not strictly in the 21 must-haves, but Stock Summary report exists without a "reorder level / alert" surface. The `items` table has the field; UI exposes it on the form per memory `pr8-images-for-items-confirmed`. If stock-out alerts are part of the dashboard story, that's missing. Defer to V1.5 if not in scope.

### Things that are surprisingly polished

- Atomic firstPayment chain (huge UX win — single-button "save & receive cash")
- Cross-tenant GSTIN cache (cost-aware design, not over-engineered)
- Two-tier numbering (FY-aware counters, backdate-safe)
- Party balance arrows in picker (matches myBillBook, immediately readable)
- Three-step onboarding wizard with numbering seed (avoids the 47-bill backfill nightmare)

### Things that are V1 scope but feel incomplete in the UX

- **Branding settings page** exists, but no preview of the second template until you switch + save (per memory `invoice-preview-during-create-and-draft`, the live-preview flow is deferred).
- **No "Send on WhatsApp" entry** anywhere except sales_invoice detail. Per scope, that's intentional for V1. But it means a quotation cannot be sent on WhatsApp — limiting for shops that quote-first.
- **No dashboard KPI tiles for "Today's sales / Today's payments received"** beyond the basic dashboard. Owner has to click into reports.
- **No "duplicate invoice" / "create another like this" CTA** on any doc detail.

### Things outside scope but worth tracking for launch comms

- Mobile breakpoint is horizontal-scroll-only (acknowledged tradeoff per memory).
- No offline mode; no PWA installability flow surfaced to user.
- No item image upload (PR8 planned).
- No signature upload UI (PR8 scope TBD).

---

## Recommended sequencing before V1 GA

If launch target is **~21 Sep 2026** (4-month build per memory
`mvp-scope-locked-option-b`), and today is **2026-05-24**, you have ~17
weeks. Suggested order:

### Week 1 (do now)
1. **B1** — fix party balance computation. One-line repo fix + a vitest test using the reversal scenario above. ~30 min.
2. **S3** — wire the "Convert to Sales Invoice" button on quotation detail. Service + API already exist. ~1 hour.
3. **H1** — `.omit({firstPayment})` from `updateDocumentSchema`. ~10 min.

### Weeks 2–3
4. **S2** — Party CSV import. Bigger lift (CSV parsing, error reporting, dry-run preview). 3–5 days.
5. **S5** — Settings → Invoice Settings page. Edit per-doc-type prefix + template. 2 days.

### Weeks 4–5
6. **S1** — GSTR-1 B2C section + ensure HSN summary is wired into the same export. 3 days.
7. **H2/H3** — code-hygiene cleanup pass. ~1 day.

### Weeks 6+
8. PR8 (item images + signature upload — per memory).
9. PR9 (additional invoice templates — per the 3-template requirement, OR formal scope renegotiation).
10. Mobile pass (card-per-line layout below sm:; bottom-sheet picker variants).
11. PDF templates refinement + festive themes (V1.5 / 2C.5).
12. Beta testing with the brother's glass + hardware shop. **Real-world GSTR-1 validation against a known-good filed invoice** (scope row 121 explicitly requires this).
13. Pricing surface + paywall enforcement (Free 20 inv/mo, WhatsApp gating).

---

## What's NOT in this audit (and why)

- **Auth flow security review** — out of scope; last reviewed at PR3 OAuth landing.
- **PDF service rendering correctness** — not exercised in this audit; needs separate review.
- **WhatsApp send queue retry / dead-letter** — outside PR7-H surface.
- **Performance** — no load testing run; pages render fast in dev (~250ms for the form page with 500 parties).
- **Browser matrix** — assumed Chromium-class only (PWA target).

---

## Closing read

PR7-H itself is **landable as-is** modulo one external bug (B1) it surfaces.
The MVP is **not** launch-ready today — three V1-scope items (GSTR-1 B2C,
party CSV import, quotation convert UI) are missing in ways the first
customer will hit on day 1. The rest of the polish list is the kind of
thing that becomes visible after the first 50 invoices, not blocking on
the first invoice.

You're closer than the gaps make it sound: every load-bearing piece (full
ledger, atomic transactions, audit log, RBAC, GST math, PDF render, share
tokens, WhatsApp delivery) is built and tested. The remaining work is
*surfacing* what's already implemented, plus one CSV-parsing slog.

Realistic call: with focused weeks on S1/S2/S3/S5, you hit a private-beta-
quality launch in **6–8 weeks**, and the full 17-week runway lets you
absorb the rest of polish + real-world GSTR validation comfortably.
