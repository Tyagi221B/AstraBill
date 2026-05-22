# AstraBill Wiki Log

Append-only. Format: `## [YYYY-MM-DD] <operation> | <title>`

---

## [2026-05-22] ops | Droplet recovery + redeploy + runbook capture

Three things bundled into one entry because they all chain.

**1) Droplet redeploy** — pulled main onto `/opt/astrabill/` (4 commits:
PR2 Step 11 demolition + PR3c wiki + PR3a PDF contract + PR3b businesses
columns) and ran `docker compose up -d --build pdf-service` to recreate
the container against the new contract. The pdf-service now validates
`body.document` (was `body.invoice`) + calls `renderDocumentPdf` and ships
the full 8-doc-type TYPE_LABEL map. Caddy was untouched. Health verified
in-container with `wget -qO- http://localhost:4000/health` →
`{"ok":true,"service":"astrabill-pdf-service"}`.

**2) SSH lockout recovery** — the redeploy was blocked for ~30 minutes by
a stacked auth failure we'd previously added: `PermitRootLogin no` in
`/etc/ssh/sshd_config` (blocks root login even via key) plus a fail2ban
ban triggered by SSH offering multiple keys (`IdentitiesOnly` wasn't set
on the laptop). DO Web Console was also dead (it goes through the
droplet's `sshd`).

Resolution path:
- Powered the droplet down + flipped Recovery mode to "Boot from Recovery
  ISO" via DO control panel
- Powered back on → DO Recovery Console (rescue Ubuntu 24.04)
- Menu option 1 (mount disk at `/mnt`) → option 6 (interactive bash)
- `sed -i 's/^PermitRootLogin no/PermitRootLogin prohibit-password/' /mnt/etc/ssh/sshd_config`
- `rm -f /mnt/var/lib/fail2ban/fail2ban.sqlite3` (clears all bans)
- Confirmed `/mnt/root/.ssh/authorized_keys` still carries the owner's
  ed25519 key
- Switched Recovery mode back to "Boot from Hard Drive" → power-cycled

Post-SSH a second trap: PAM forced password change (`chage -d 0 root`-style
expiry) closed the session. Used DO Access → "Reset Root Password" to
get a temp password emailed, completed the PAM password change, then
`chage -d "$(date +%Y-%m-%d)" root && chage -M 99999 root` to remove the
expiry policy entirely.

**3) Runbook captured** — wrote [[decision/droplet-operations]] so this
30-min recovery becomes a 5-min recovery next time, and so future agent
sessions know the operational layout end to end:
- Droplet identity (name, region, size, IPs, DNS)
- Repo layout (`/opt/astrabill/` clone, `deploy/` subdir with
  `docker-compose.yml` + Caddyfile + `.env`)
- Deploy flow (`git pull` + `docker compose up -d --build pdf-service`)
- SSH config (incl. mandatory `IdentitiesOnly yes` on the laptop and the
  exact rescue-ISO procedure)
- GitHub deploy-key setup (queued — current deploys still use a
  short-lived PAT; lost ~10 min to a PAT-expired prompt mid-deploy)
- Common operations (restart / rebuild / env-change / Caddy edit)

**DECISIONS.md** — two new rows under Stack:
- "Droplet identity" — public hostname, repo path, compose location,
  deploy command, Cloudflare DNS-only requirement (orange-cloud breaks
  ACME)
- "Droplet SSH" — `PermitRootLogin prohibit-password`, fail2ban
  posture, `IdentitiesOnly yes` requirement, recovery procedure summary

**wiki/index.md** — new entry for `decision/droplet-operations.md`.

**Memory candidates** — none added; everything in DECISIONS.md +
droplet-operations.md is reachable from a fresh session via the
existing resume pattern.

---

## [2026-05-22] build | PR3b — businesses columns rename + dead-column drop

Migration 0008 (`drizzle/0008_pr3b_businesses_rename.sql`) — applied
to the shared Supabase project.

**Rename (live columns):**
- `businesses.invoice_template_id` → `document_template_id`
- `businesses.invoice_settings`    → `document_settings`
- Schema type `InvoiceSettings` → `DocumentSettings`;
  `DEFAULT_INVOICE_SETTINGS` → `DEFAULT_DOCUMENT_SETTINGS`

**Drop (dead columns):**
- `businesses.invoice_terms` — superseded by `businesses.doc_type_defaults`
  jsonb (per-doc-type T&C defaults). Pre-flight grep showed zero callers.
- `businesses.invoice_number_prefix` — superseded by the
  `document_counters` table (per-doc-type, per-FY counters). Pre-flight
  grep showed zero callers.

**Consumer updates** (all in the same commit):
- `lib/schemas/business.ts` — Zod `documentColumns` (was `invoiceColumns`);
  `updateBrandingSchema` accepts `documentTemplateId` / `documentSettings`.
- `lib/services/document-pdf.ts` — reads `business.documentTemplateId` /
  `business.documentSettings.columns`.
- `app/b/[businessId]/settings/branding/page.tsx` — initial-state mapper
  + `DEFAULT_DOCUMENT_SETTINGS` import.
- `app/b/[businessId]/settings/branding/BrandingEditor.tsx` — PATCH body
  uses the renamed keys.
- `lib/pdf/contract.ts` + `pdf-service/src/contract.ts` — `terms` field
  comment now points readers at `businesses.doc_type_defaults` (was the
  old `invoice_terms` fallback).

**Out of scope** (intentionally deferred):
- LEGACY bank fields on `businesses` (`bank_name`, `bank_account_number`,
  `bank_ifsc`, `bank_account_holder`, `upi_id`) are still the live source
  for PDF bank/UPI blocks. Migrating those readers to `money_accounts`
  (default Bank account) is a separate PR (PR3d).

**Verification**: `tsc --noEmit` clean (Next.js side). `npm test` 30/30.
`npm run build` produces a Vercel-ready bundle.

`drizzle/meta/_journal.json` carries entry idx 8.

---

## [2026-05-22] build | PR3a — PDF contract Invoice* → Document* rename

The PDF render contract was the last surface still using "Invoice"
type names after PR2's full-ledger pivot. With 8 doc types now sharing
one render path the "Invoice" prefix on the contract types misled
readers — none of these are tied to a specific doc type.

**Symmetric rename on both sides of the HTTP boundary** (`lib/pdf/contract.ts`
+ `pdf-service/src/contract.ts`):
- `InvoiceType` → `DocumentType`
- `InvoiceStatus` → `DocumentStatus`
- `BusinessOnInvoice` → `BusinessOnDocument`
- `BillToOnInvoice` → `BillToOnDocument`
- `ShipToOnInvoice` → `ShipToOnDocument`
- `LineItemOnInvoice` → `LineItemOnDocument`
- `ExtraChargeOnInvoice` → `ExtraChargeOnDocument`
- `TotalsOnInvoice` → `TotalsOnDocument`
- `InvoicePayload` → `DocumentPayload`
- `RenderRequest.invoice` (field) → `RenderRequest.document`

**pdf-service callers**:
- `render.ts` — `renderInvoicePdf()` → `renderDocumentPdf()`.
- `index.ts` — body shape validator + error message updated.
- `templates/Modern.tsx` + `Classic.tsx` — destructure rebound to
  `{ document: doc, branding }` (the `doc` alias avoids shadowing the
  browser `document` global); all `invoice.X` accessors → `doc.X`;
  TYPE_LABEL typed as `Record<DocumentType, string>`; comments tightened.

**Next.js callers**:
- `lib/services/document-pdf.ts` — payload typed as `DocumentPayload`;
  RenderRequest uses `document:` instead of `invoice:`; internal locals
  renamed; branding-preview fallback reads `fixtures.complex.document`.
- `lib/pdf/fixtures.ts` — all four fixtures (small / medium / complex /
  long) keyed by `document:` instead of `invoice:`.

**What stays** (legitimate names):
- `sales_invoice` / `purchase_invoice` / `proforma_invoice` doc_type literals.
- TYPE_LABEL VALUES ("Tax Invoice", "Purchase Invoice", "Proforma
  Invoice", …) — user-facing labels.
- `INVOICE_TEMPLATE` constant in `lib/services/whatsapp-send.ts` — that
  is the Meta-HSM template name; renaming would require re-provisioning
  the external template with Meta.

**Verification**: `tsc --noEmit` clean (Next + pdf-service both).
`npm test` 30/30. `npm run build` produces a Vercel-ready bundle.
pdf-service `npm run build` clean.

**Mandatory follow-up**: pdf-service droplet redeploy — `git pull &&
docker compose up -d --build pdf-service` on the DO droplet. The
contract change is wire-incompatible until both sides redeploy; the
deployed pdf-service still expects `body.invoice` and will 400 on
every render call once Vercel ships the Next.js side. (Bundles with
the still-pending PR2 redeploy for the doc-type label fix.)

---

## [2026-05-22] lint | PR3c — wiki SSOT cleanup after PR2 demolition

Full post-demolition audit surfaced eight stale references that
escaped Step 11. None broke the build; all violated the "decision
pages explain *why*, DECISIONS.md owns the *what*" SSOT rule.

**Pages rewritten / corrected**:
- **wiki/decision/v1-scope.md** — converted to a SUPERSEDED stub.
  Strips the old 12-table schema (which still listed `customers` /
  `products` / `invoices` / `invoice_line_items` / `payments` /
  legacy `stock_movements`), preserves the WhatsApp-sender-identity
  rationale that still carries forward, and points readers at
  `decision/full-ledger-pivot` + `DECISIONS.md`.
- **wiki/decision/code-architecture.md** — folder structure rewritten
  to match the actual post-PR2 layout (`app/b/[businessId]/{parties,items,sales,purchases,…}`,
  `lib/{repositories,services,schemas}/…`, no more `server/` split, no more
  legacy `IPaymentProvider` example since V1 has no gateway). Request-flow
  example rewritten as `createDraft(documentId, …)` on `lib/services/documents.ts`.
- **wiki/decision/database-and-rbac.md** — Drizzle schema example uses
  `documents` table + `docType` / `docStatus` enums (was `invoices` +
  `invoiceStatus`). PERMISSIONS map example shows the real `party:* / item:* /
  document:* / payment:* / money-account:* / report:*` ladder (was the legacy
  `invoice:create / customer:view / …` set). Soft-delete section reworded to
  match the cancellation-matrix in DECISIONS.md.
- **wiki/decision/drafts-and-multi-device.md** — `invoices` /
  `invoiceStatus` → `documents` / `docStatus` throughout; OCR-flow
  API example uses `/api/documents/from-photo`; related-pages link
  retargeted from `[[decision/v1-scope]]` to `[[decision/full-ledger-pivot]]`.
- **wiki/decision/whatsapp-invoice-send.md** — title becomes "WhatsApp
  Document Send"; lazy-backfill section notes the column lives on
  `documents.share_token`; entrypoint renamed to `sendDocumentOnWhatsApp`;
  related-pages link retargeted.

**DECISIONS.md** — five rows corrected:
- "WhatsApp sender identity" — rationale link `[[decision/v1-scope]]` → `[[decision/whatsapp-meta-api]]` (v1-scope is now a stub).
- Payment-recording section — six rows rewritten: `invoices.amount_paid` →
  `documents.amount_received`; source is now
  `SUM(payment_entry_allocations.allocated_amount)` filtered to
  non-cancelled `payment_entries`; status thresholds use the actual
  `unpaid / partial_paid / paid` enum; "voiding a payment" reworded to
  "cancelling a payment" with the two-leg-ledger reversal.
- Public-invoice-share — `invoices.share_token` → `documents.share_token`;
  unscoped-repo list now lists `findBusinessById`, `findPartyById`,
  `getDocumentByShareToken` (was `findCustomerById`).
- WhatsApp invoice send — every row references `documents` / `parties` /
  `documents.share_token` / `parties.mobile_number`; the entrypoint is
  `sendDocumentOnWhatsApp(documentId, actorUserId)`; the route is
  `POST /api/documents/[id]/send-whatsapp`; sales-invoice-only guard
  called out explicitly.
- Section header (line 129) — reworded from "carry forward their patterns…
  (rename `invoices.x` → `documents.x` …)" to "(the rename completed in
  PR2 Step 11, 2026-05-22)" so it no longer reads as future work.

**wiki/index.md** — `v1-scope.md` summary marked SUPERSEDED; `drafts-and-multi-device.md`
summary now reads `documents.status='draft'`.

**Schema audit result**: clean. No drift between `lib/db/schema.ts`,
`drizzle/*.sql`, `drizzle/meta/_journal.json` (idx 0–7), `lib/db/relations.ts`,
or the API/page directory structure. Every deleted directory verified absent;
every dropped table/enum verified absent from code (zero matches for
`invoiceType` / `invoiceStatus` / `stockMovementType` / `tableInvoices` /
`invoiceId` outside historical comments).

**Code naming debt remaining** (deferred to PR3a + PR3b, not in this commit):
- PDF contract types still say `InvoiceType` / `InvoiceStatus` /
  `InvoicePayload` / `BusinessOnInvoice` / `BillToOnInvoice` /
  `LineItemOnInvoice` / `RenderRequest.invoice` in both
  `lib/pdf/contract.ts` and `pdf-service/src/contract.ts`. (PR3a.)
- `businesses` table still has `invoice_template_id` / `invoice_settings` /
  `invoice_terms` / `invoice_number_prefix` columns; needs migration 0008
  to rename. (PR3b — `invoice_number_prefix` likely dead; confirm before drop.)

DECISIONS.md "Last reconciled" bumped to `2026-05-22 (PR3c — wiki SSOT cleanup; stale invoices.* / customers.* references replaced with current documents.* / parties.* field names)`.

---

## [2026-05-22] build | PR2 Step 11 — atomic demolition

Three pre-demolition refactors first, then the destructive cut.

**Pre-demolition refactors** (the cross-domain surfaces that were still on legacy tables):
- **Dashboard KPIs** → new domain. `lib/services/dashboard.ts` rewritten on `sumSalesOutstandingForBusiness` / `sumSalesRevenueForBusinessSince` / `sumPaymentsInForBusinessSince` (new repo helpers on `documents` + `payment_entries`) and `listLowStockItems` (a join of `items` with `stock_movements` summed inline). Dashboard page renders Document rows, not Invoice rows.
- **Public share `/i/[shareToken]`** → new domain. `lib/services/public-document.ts` reads `documents.share_token`; page rewritten to render the new doc shape; PDF generation rewritten as `lib/services/document-pdf.ts` (maps Document + DocumentLineItem + DocumentAdditionalCharge → InvoicePayload), with `renderPublicDocumentPdfByToken` behind `/api/i/[shareToken]/pdf`. The PDF contract's `InvoiceType` enum updated on both sides (Next + pdf-service) to mirror the new `doc_type` enum; Modern + Classic templates' `TYPE_LABEL` maps updated; `lib/pdf/fixtures.ts` swapped to the new enum values.
- **WhatsApp send for documents.** New `sendDocumentOnWhatsApp(documentId, actorUserId)` service (sales-invoice-only — template variables are tuned for that artifact), new `POST /api/documents/[id]/send-whatsapp` route, new `WhatsAppPanel` wired onto the sales-invoice detail page next to a new `Download PDF` button. `whatsapp_messages.invoice_id` swapped to `whatsapp_messages.document_id`.

**Demolition itself** (one atomic migration + the code that goes with it):
- `drizzle/0007_pr2_demolition.sql`: ADD whatsapp_messages.document_id + DROP invoice_id; DROP legacy tables (`payments` → `stock_movements` (legacy product-bound) → `invoice_line_items` → `invoices` → `products` → `customers`); RENAME item_stock_movements → stock_movements (table + indexes + FK constraints); DROP TYPE invoice_type / invoice_status / unit / stock_movement_type.
- `lib/db/schema.ts` lost ~200 LOC of legacy tables + enums + type exports; `lib/db/relations.ts` rewritten in the new domain shape.
- Deleted: `lib/repositories/{customers,products,invoices,payments,stock-movements}.ts` · `lib/services/{customers,invoices,payments,invoice-pdf,public-invoice,products}.ts` · `lib/schemas/{invoice,customer,product,payment}.ts` · `lib/invoice-number.{ts,test.ts}` · `app/api/{customers,invoices,products,payments}/` · `app/b/[businessId]/{customers,invoices,products}/`.
- Renamed: `lib/repositories/item-stock-movements.ts` → `lib/repositories/stock-movements.ts`; schema export `itemStockMovements` → `stockMovements`; type `ItemStockMovement` → `StockMovement`.
- `lib/rbac.ts` scrubbed of `customer:*` / `product:*` / `invoice:*` rows (only `party:*` / `item:*` / `document:*` ladders remain).
- `lib/routes.ts` lost the legacy URL helpers; `components/app/Sidebar.tsx` dropped its "Legacy" nav group.

**Verification**: `tsc --noEmit` clean. `npm test` 30/30. `npm run build` produces a Vercel-ready bundle (the route table no longer carries `/invoices` or `/customers` or `/products`).

**One follow-up**: the pdf-service droplet needs `git pull && docker compose up -d --build pdf-service` so the templates pick up the new `TYPE_LABEL` map. Until then, doc-type labels render as the JavaScript string "undefined" — cosmetic, fully functional otherwise.

Memory: no new memories — every fact landed in DECISIONS.md or the [[overview]] log entry.

---

## [2026-05-21] decisions | V1 scope locked (Option B) + DECISIONS.md reconciled to pivot

User confirmed **Option B**: full V1 (21 must-haves), 4-month build, ship target ~21 Sep 2026. No shortcuts, senior-dev quality, system-design principles.

`DECISIONS.md` updates:
- New top section **"Product — V1 (Full-Ledger Pivot, 2026-05-21)"** with 29 binding rows covering: scope, party model, accounting model, doc model, numbering format + assignment + onboarding seed + FY reset, ITC fields, lineage, cancellation matrix, two-leg posting, UPI QR computed, signature scope, per-doc-type T&C, audit log, items units / inclusive pricing, party CSV import, GSTR exports, V1 reports, Indian formatting, currency scope, two-PR build sequence.
- "Product — V1 Scope" section retitled **"(SUPERSEDED 2026-05-21)"** with a header banner explaining the relationship to the new pivot section.
- Inline supersede markers on 5 rows: Invoice numbering · Custom invoice prefix · Invoice terms · Invoice types · V1 tables count. Drafts row updated (`invoices` → `documents` table).
- "Last reconciled" bumped to 2026-05-21.

Memory files added:
- `mvp-scope-locked-option-b.md` — the 21-feature list, what's out, schema PR sequence
- `doc-numbering-onboarding-seed.md` — owner-set starting number per doc type; FY-derivation from doc_date; lazy FY rollover

**Status: ready for schema draft (PR1). Conversation compact point.**

---

## [2026-05-21] ingest | myBillBook Invoice Settings + Purchase Invoice + Quotation

Source: 4 screenshots — Quick Invoice Settings modal (toggles OFF + ON states), Create Purchase Invoice form, Create Quotation form.

Updates to `wiki/competitor/mybillbook-architecture.md`:
- New section: **Quick Invoice Settings modal** — 4 toggles (Prefix, Show Purchase Price, Show Item Image, Price History) + Theme dropdown + Full Settings deep-link.
- New section: **Purchase Invoice form** — terminology flips (Bill From, Amount Paid), **NEW field `Original Inv No.` required for ITC reconciliation**, sidebar map, V1/V2 scope.
- New section: **Quotation / Estimate form** — `Valid For` / `Validity Date` semantic, no payment fields, signature still renders. **User insight: quotations are heavily used in Indian B2B — V1 priority, not V1.5.**
- Schema addition: `documents.original_doc_number` + `original_doc_date` (purchase docs); `documents.source_doc_id` (Quotation → Invoice conversion).
- Trimmed "what we still need to research" — research now functionally complete for V1 schema.

Status: **research phase done. Moving to schema draft.**

---

## [2026-05-21] ingest | myBillBook saved Sales Invoice + Record Payment In

Source: 4 screenshots — invoice form bottom (with bank + auto-QR), rendered Sales Invoice #1 (top + bottom), Record Payment In modal.

Updates to `wiki/competitor/mybillbook-architecture.md`:
- **Q8 CLOSED ✅** — Bill To uses `parties.name` (Party Name), Contact Person Name is internal CRM only, never on rendered invoice.
- New section: **Saved Sales Invoice — rendered view** with 8 locked findings (UPI QR is computed at render, signature is business-level, due-date default = 30d, Total-in-words is GST-mandatory, GST classification end-to-end verified, column visibility is per-template setting, T&C placeholder rendered verbatim, TAX INVOICE / ORIGINAL FOR RECIPIENT GST labels).
- New section: **Record Payment In modal** with full field map + schema sketch (`payment_entries`, `payment_entry_allocations`, two-leg ledger post, settlement-discount write-off as third leg).

Memory: pending — UPI-QR-auto-generation insight worth saving since it's an AstraBill schema decision (never store QR images).

Research status: Sales family research **done**. Remaining: Settings (red dot) on invoice form, then Purchase Bill (expected mirror of Sales).

---

## [2026-05-17] init | Wiki initialized

Wiki structure created. AstraBill defined as billing software for SMEs. Market research phase begins.

## [2026-05-17] ingest | Market research pass 1 — India SME billing landscape

Sources ingested: India accounting software market reports, Tally pricing, Vyapar/KhataBook/Zoho/Refrens/Odoo competitor analysis, WhatsApp API pricing, GST compliance landscape, Razorpay Fix My Itch, UPI payment data, India MSME cash flow crisis data.

Pages created/updated:
- overview.md (thesis formed)
- index.md (full catalog)
- concept/india-sme-market.md
- concept/whatsapp-billing-opportunity.md
- concept/gst-compliance.md
- concept/pricing-model.md
- competitor/tally.md
- competitor/vyapar.md
- competitor/khatabook.md
- competitor/zoho-books.md
- competitor/refrens.md
- competitor/odoo.md
- decision/market-validation.md

Key findings: Market validated. Tally's learning curve confirmed (10x real cost). Vyapar's broken WhatsApp = wedge. RBAC gap = wedge. Marketing identified as the real moat, not product.

## [2026-05-17] ingest | Customer discovery — brother's glass/hardware shop + kacha/pakka insight

First customer profiled: glass + hardware shop owner. Key revelations:
- Multi-unit billing required (sq.ft., kg, linear ft.)
- Udhaar (contractor credit) tracking = the daily-use driver, not invoicing
- Kacha/pakka dual books = mainstream practice in Indian trading businesses
- Legal positioning: call it "estimates + cash receipts", never "kacha accounts"
- Competitors in this space (HisabKitab, BUSY, Marg ERP) exist but all have old UX and no WhatsApp

Pages created: customer/hardware-shop-owner.md

## [2026-05-17] lint | First full lint pass — fixed 9 contradictions, added DECISIONS.md

Opus 4.7 review found the wiki self-contradicting in 9 places (all in decision
content): Supabase Auth vs NextAuth in 3 pages, OTP-in-DB vs Redis, SMS vs WhatsApp
OTP, otp_codes table that shouldn't exist, free-tier 10 vs 20 invoices, "service
businesses first" vs trading-shop pivot in 2 pages, an orphan [[link]], and an
internal job-architecture contradiction.

Root cause: decisions were duplicated across pages; an LLM appends but does not
reconcile. Fix: created DECISIONS.md as single source of truth for all binding
facts. Decision pages now hold rationale only and link instead of restating.
Added SSOT + lint-before-commit rules to CLAUDE.md.

## [2026-05-17] lint | RLS dropped — 10th contradiction caught before schema build

New-chat (Opus 4.7) schema-planning session caught contradiction #10: the RLS
policy in database-and-rbac.md used `auth.uid()`, a Supabase Auth function — but
we use NextAuth. The policy would always match nothing, and our privileged Drizzle
connection bypasses RLS anyway. Lint pass missed it because we grepped the string
"Supabase Auth", not the semantics.

Decision: drop RLS entirely. Tenant isolation enforced in the repository layer
(every query scopes by business_id). Updated DECISIONS.md, database-and-rbac.md,
infrastructure.md. Also confirmed table count: 11 (10 business + accounts for
Google OAuth; no sessions/verification_token/otp_codes). Added GST split columns
and invoice type enum to the v1-scope schema.

## [2026-05-17] decision | audit log + soft delete added — table count 11 → 12

Schema-build session (Opus 4.7). User added three cross-cutting requirements
before coding: (1) an audit/activity log of every user action, (2) soft delete,
(3) standardised error + response handling. The audit log needs a table, so the
binding table count moved 11 → 12 (11 business tables incl. `audit_log` +
`accounts`). Updated the DECISIONS.md "V1 tables" row, added "Audit log",
"Deletes", and "Timestamps" rows. Added rationale sections to database-and-rbac.md
and refreshed the v1-scope.md table list. Also folded in: `businesses.plan`,
`created_by` on invoices/payments, `last_login_at`/`last_active_at` on users,
`round_off` on invoices, `deleted_at` on mutable tables. Schema build follows.

## [2026-05-17] decision | drafts = `invoices.status='draft'`; localStorage for pre-auth; multi-device "for free"

Schema-build session (Opus 4.7). User raised future AI feature: photograph an
estimate on mobile → OCR → auto-filled draft on desktop. Examined whether this
needs a separate `drafts` table or Redis-held drafts.

Realised the `invoices` table with `status='draft'` already gives us everything:
drafts are first-class invoices, multi-device works because they're in Postgres
and scoped to the business, and future AI features (OCR, suggested GST, auto-
categorise customer) compose by writing draft `invoices` rows — no new storage
layer. localStorage holds the pre-auth anonymous form state only (in-session,
not durable; does not contradict onboarding-flow.md's "no save for anonymous").

Added DECISIONS.md "Drafts" row. Created wiki/decision/drafts-and-multi-device.md.
Indexed. No contradiction with existing pages.

## [2026-05-17] decision | auth = two equal entry doors (Google + WhatsApp OTP), neither fallback

About to wire NextAuth. Reconsidered the "Fallback: Google OAuth" framing
from the earlier auth-strategy doc. For an Android user, Google one-tap is
faster than waiting for a WhatsApp OTP; for a user without Gmail handy, OTP
works first try. Neither door is fundamentally primary — the schema connects
both back to the same `users.id`.

Updated DECISIONS.md "Login methods" row (replaces "Fallback login") and
clarified the "Session strategy" row (JWT is stateless; DrizzleAdapter
persists users + accounts only, no sessions table). Rewrote the auth-strategy
page's framing section to "Two Equal Entry Doors" with the per-user-type
breakdown. Also removed the restated-fact decision table at the top of that
page (SSOT rule — pre-existing duplication caught now). Account linking when
a "missing channel" already belongs to another account is V1.1 (V1: refuse
and tell them to log in via the existing one).

## [2026-05-18] decision | file storage = Cloudinary; transactional email = Loops.so; Supabase scope clarified

Three related infra decisions after auth smoke-test green:

(1) **File storage moves from Supabase Storage to Cloudinary.** Free tier
covers V1 (25 GB storage + 25 GB bandwidth/month), built-in image transforms
make logo resizing for invoice PDFs trivial, strong Indian CDN presence, and
the OCR + AI add-ons compose with the future photograph→invoice feature
([[decision/drafts-and-multi-device]]).

(2) **Transactional email = Loops.so**, FROM `hello@astrabill.com` (display
"AstraBill"), Reply-To same; sending domain `astrabill.com` authenticated
once via SPF + DKIM + DMARC DNS records. Never use `asmit@astrabill.com` as a
FROM (conflates personal with system). WhatsApp remains the primary delivery
channel; email is secondary.

(3) **Supabase scope clarified — Postgres only.** New DECISIONS row makes
explicit what we don't use: no Supabase Auth, no Supabase Storage, no
Supabase Realtime, no `@supabase/supabase-js` anywhere. Codebase talks to
Postgres via `postgres` driver / Drizzle, full stop.

Updates: DECISIONS.md (3 new rows: File storage, Supabase scope, Transactional
email), wiki/decision/infrastructure.md (rewrote Supabase + Cloudinary +
Loops sections, refreshed env-vars listing), wiki/decision/pdf-generation.md
(removed Supabase Storage restatements; storage now described as the
provider-agnostic `IStorageProvider`), .env.example (Supabase Storage block
out, Cloudinary + Loops blocks in). Memory: created astrabill-email.md.

Pre-existing SSOT drift on pdf-generation.md cleaned up in the same pass —
the page now describes the redirect strategy without naming a specific
storage provider, which is the right level of abstraction for a "PDF
generation" decision page.

## [2026-05-18] ingest | Om Glass Enterprises real invoices → Phase 2 plan

User's brother shared 3 photographed documents from his shop (Om Glass
Enterprises, Roorkee) — two GST tax invoices and one delivery challan.
Ingested as ground truth for what a trading-business invoice actually needs.

Key findings:
- **Dual-unit billing** — a glass line shows BOTH "04 Pcs" and "11.34 Sq.Mt";
  rate is per sq.m, taxable value = area × rate. A single quantity+unit per
  line can't express it. The headline finding — a genuine moat.
- Bill-to and ship-to are separate blocks.
- Freight is its own row, added post-tax.
- Transport mode + vehicle number appear on the invoice.
- A non-GST delivery challan is a real, separate document type.
- Amount in words; original/duplicate/triplicate copies.

Updates: customer/hardware-shop-owner.md gained a "Real Invoices" section;
DECISIONS.md gained a "Product — Invoice Anatomy" section (dual-unit,
ship-to, freight, transport, `delivery_challan` type); created
decision/phase-2-plan.md — the HLD/LLD blueprint for Phase 2A (customers +
products + invoice-anatomy migration) and 2B (WhatsApp hero loop); noted the
auth-first vs anon-first divergence in onboarding-flow.md. Indexed.

Phase 1 (auth + the invoice CRUD round-trip loop) is complete and
smoke-tested. The build continues from phase-2-plan.md in a fresh session.

## [2026-05-18] ingest | supplier invoice (Hitesh Hardware → Om Glass) — 3 refinements

A 4th document: a supplier invoice billing the brother's shop (Hitesh
Hardware, Delhi → Om Glass, Uttarakhand). Refines the Phase 2 plan:

- **Interstate confirmed** — Delhi (07) → Uttarakhand (05) charges IGST @ 18%,
  CGST/SGST blank. Real-world validation of `classifyTax`. No change.
- **`set` unit** — hardware sells in sets ("30 set @ ₹530/set"). Added to the
  Phase 2 `unit`-enum migration alongside `sqm`.
- **Extra charges are a list, not one field** — this invoice has both
  "Loading" and "Freight" as separate rows. The earlier single-`freight`
  column decision is superseded: invoices carry a JSONB array of
  `{ label, amount }` post-tax charges. DECISIONS.md "Freight" row replaced
  with "Extra charges"; phase-2-plan.md migration updated.
- **Invoice terms** — real invoices print a T&C block (late-payment interest,
  jurisdiction). New DECISIONS row + `businesses.invoice_terms` in the
  Phase 2 migration.

Updated customer/hardware-shop-owner.md (sources 4 → 5), DECISIONS.md
"Product — Invoice Anatomy", and decision/phase-2-plan.md.

## [2026-05-18] ingest | computerised invoice (Diamond Tuff Glass) — competitor bar + refinements

A 5th source: Diamond Tuff Glass Enterprises tax invoice #4983 — the only
*software-generated* invoice in the set. Shows what the current best tool in
this trade produces (cramped, watermark-heavy, generic Tally output — the bar
AstraBill must beat).

Refinements captured:
- **Taxable vs non-taxable charges** — Diamond Tuff's "Hole, Cut Out Template
  Charge" is folded into the taxable value and *then* taxed at 18%; Om Glass's
  freight sits post-tax. So `extra_charges` entries need a `taxable` flag
  (+ `gstRate`), not a flat post-tax assumption. DECISIONS "Extra charges"
  row and the phase-2-plan migration updated.
- **FY-aware invoice numbering** — `DTG/24-25/4983` = prefix/FY/sequence.
  GST Rule 46 wants numbers "unique for a financial year". User chose
  FY-aware: `{prefix}/{FY}/{seq}`, resets per business+type+FY, prefix
  business-configurable. New DECISIONS row; phase-2-plan Step 1b added;
  v1-scope numbering line updated.
- **E-way bill number** — optional `eway_bill_number` field (recorded, not
  generated). HSN-wise tax summary — a PDF-rendering concern, derived from
  line items. Both added to DECISIONS + the plan.
- Proforma-invoice reference confirms the estimate → tax-invoice flow.

Updated customer/hardware-shop-owner.md (sources 5 → 6), DECISIONS.md
"Product — Invoice Anatomy" (Extra charges revised; new rows for Invoice
numbering, E-way bill, HSN tax summary), decision/phase-2-plan.md (Step 1
migration + new Step 1b numbering), decision/v1-scope.md.

The Phase 2 blueprint is now built from 6 real documents. Build proceeds
from phase-2-plan.md in a fresh session.

## [2026-05-18] edit | sharpened the kacha/pakka framing in hardware-shop-owner.md

A discussion exposed that the "How to Handle Kacha Accounts" section framed
the non-invoice document types as euphemisms for kacha ("the unbilled quote =
the 'kacha' record without calling it that") — muddled, and positioning-risky.

Reframed the section as "The Kacha Question — Our Position":
- "Kacha" conflates two things: (1) illegal tax evasion — AstraBill cannot
  and does not help with it; a digital record is *more* discoverable than
  paper, and that owner is not our customer; (2) informal-but-legal cash
  business — which is who we serve.
- Estimate / cash receipt / delivery challan are legitimate document types,
  not disguised kacha. The owner records the cash side for udhaar, clarity
  and getting paid — not tax-hiding.
- Strategic bet stated plainly: help SMEs formalise gracefully, not stay
  hidden. "Data management, not GST filing" legal position retained.

DECISIONS.md unchanged — its terse "never label it kacha" row was already
fine. Pure wiki framing refinement; no code, no decision change.

## [2026-05-18] decision | analytics + error tracking = PostHog; Sentry deferred

PostHog was added to the codebase via its setup wizard during Phase 2A but
had never been a recorded decision — SSOT drift. User's call: PostHog covers
**both** product analytics and error tracking for V1 (proven in their other
projects); Sentry is **deferred**, revisit only if PostHog's error tracking
proves insufficient — running both = two error trackers, two bills.

Updated DECISIONS.md: replaced the "Error alerting | Sentry" Stack row with
"Analytics + error tracking | PostHog" plus a "Sentry | Deferred" row.
Updated infrastructure.md (new "Analytics + Error Tracking — PostHog"
section, env-var list, event-hygiene rule) and notifications-and-crons.md
(the cron alerting path now names PostHog, not Sentry).

Code follow-up (not done here — separate pass): commit the wizard's
still-unstaged standalone files (instrumentation-client.ts, lib/posthog-server.ts,
next.config.ts, etc.), dedupe the double-fired events (`invoice_finalized` /
`invoice_draft_created` currently fire from both client and server with the
same name), wire `lib/http.ts`'s `reportInternalError` hook to PostHog, and
add the POSTHOG_* keys to .env.example.

## [2026-05-18] decision | Phase 2A shipped — numbering refinements recorded; plan reframed to 2B

Phase 2A built out across two commits (`1496cc7`, `944adf4`): the
invoice-anatomy migration, customers + products catalogues, extra-charge GST
math, stock movement on finalise, and a vitest correctness gate for
`lib/gst.ts`. Four numbering facts emerged *during* the build that the
DECISIONS.md "Invoice numbering" row didn't capture:

- The number is assigned **at finalise**, not create — a draft is not a
  legally issued document and must not consume a number.
- A draft therefore carries `number = NULL` until finalised (schema migration
  0002 dropped the NOT NULL; the partial unique index treats NULLs as
  distinct, so drafts coexist).
- The sequence counts **only finalised rows**, so an abandoned draft never
  burns a number — the issued series is gap-free (GST Rule 46).
- A business-set custom prefix applies to **tax invoices only**; sharing it
  across types would collide a tax invoice and an estimate on the unique
  index.

Updates: DECISIONS.md "Invoice numbering" row sharpened + new "Custom invoice
prefix" row (binding facts, once each). decision/phase-2-plan.md rewritten —
2A is shipped, so the page no longer carries the 2A build blueprint (that's
git history now); it keeps two rationale notes (the *why* behind
finalise-time numbering and tax-only prefix) and is otherwise the live 2B
blueprint. index.md summary line updated. overview.md gained a thesis-
evolution line. The earlier SSOT-drift risk — phase-2-plan.md restating
numbering facts that also live in DECISIONS.md — is now resolved: the page
holds rationale only and links.

## [2026-05-18] decision | PostHog reset — wizard reverted, minimal client-only setup

The PostHog setup wizard (recorded in the entry above) had scattered 14
events across 9 files, fired client+server duplicates of the same event
names, never called `identify()`, and left two competing env-var names. It
was reverted wholesale and rebuilt minimally against PostHog's own Next.js
App Router reference: `instrumentation-client.ts` init, `/ingest` reverse
proxy, layout-mounted `identify`, `reset` on sign-out, three curated
client-side events. `posthog-node` and the server-side client were removed
entirely — the server captures were pure duplicates of client events.
Commit `1bd9e2e`.

Wiki realigned to the shipped reality:
- DECISIONS.md "Analytics + error tracking" row: `posthog-js` only;
  `posthog-node` explicitly **deferred** to 2B (the Razorpay webhook is the
  first genuinely server-only event). The "Sentry — Deferred" row is
  unchanged and still correct.
- infrastructure.md "Analytics + Error Tracking" section rewritten — drops
  `posthog-node` / `lib/posthog-server.ts` / the `reportInternalError`→
  PostHog claim (never wired), documents identify-in-layout + reset + the
  three events, and the env block now lists `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
  + `NEXT_PUBLIC_POSTHOG_HOST` (the wizard's `POSTHOG_API_KEY` is gone).

The 2026-05-18 PostHog entry above is left intact (the log is append-only) —
its "code follow-up" punch list is superseded by this entry: the wizard files
were reverted rather than committed, the double-fired events were removed
rather than deduped, and `reportInternalError`→PostHog was dropped (V1 has no
server-side PostHog). notifications-and-crons.md is unchanged — the DO cron
worker is a separate Node service; its own `posthog-node` alerting lands when
that worker is built in 2B.

## [2026-05-18] decision | frontend foundation (F1) — Tailwind v4, theming, marketing site

The app had shipped on inline `React.CSSProperties` everywhere — fine for
proving the data layer, impossible to theme. Phase F1 lays the frontend
foundation and rebuilds the public landing page.

Decisions taken:
- **Tailwind v4** (CSS-config, `@theme`) + CSS-variable design tokens —
  semantic names (`background`/`foreground`/`primary`/`muted`/`border`…),
  one `:root` + `.dark` block. No `tailwind.config.js`.
- **Light + dark theming** via `next-themes` (class strategy, `.dark` on
  `<html>`, system default).
- **Marketing site as a route group** — `app/(marketing)/` carries its own
  Header/Footer; the authed app pages stay outside it. Root `app/layout.tsx`
  reduced to `<html>`/`<body>` + providers. `/` is the landing; the signed-in
  dashboard moved to `/dashboard` (added to `proxy.ts`; the in-app "← Home"
  links + post-sign-in destination now point there).
- **shadcn/ui deferred to the app pass** — the marketing components are
  hand-rolled Tailwind; the token foundation is already shadcn-shaped, so
  adopting it later for the app forms (Input/Select/Dialog/Table) is
  friction-free. Recorded as the intended path, not yet a binding row.
- App pages (invoices/customers/products) **not** migrated — left on inline
  styles; they move into an `(app)` group and onto the theme in a later pass.

Shipped: the themed landing page (hero, features, how-it-works, pricing,
CTA), a relocated themed `/dashboard`, and four basic legal/info pages —
`/privacy`, `/terms`, `/refund`, `/contact` — needed for Razorpay's website
verification (first-draft content, effective-dated, flagged for legal
review). SEO: `lib/seo.ts`, `robots.ts`, `sitemap.ts`, Organization JSON-LD,
per-page metadata, `metadataBase`.

Wiki: DECISIONS.md gained Styling + Theming (Stack) and Site structure (Code
Architecture) rows; created decision/frontend-architecture.md (rationale);
indexed. Next.js + Tailwind build green, tsc clean, vitest 41/41.

Still F2: the blog (MDX pipeline). Legal content needs a real review pass.

## [2026-05-19] decision | frontend app pass (F3) — shadcn/ui adopted, app pages migrated off inline styles, AppShell + welcoming sign-in

The companion to F1: every authed page (`/sign-in`, `/dashboard`, `/onboarding`,
`/customers/*`, `/products/*`, `/invoices/*`) had still been carrying inline
`React.CSSProperties` from Phase 2A. F3 finishes that migration, brings the
shadcn/ui foundation in, and dedupes the chrome that every app page was
hand-rolling.

Decisions taken:
- **shadcn/ui adopted, no preset.** Ran `npx shadcn@latest init` properly for
  the canonical setup (writes `components.json`, `lib/utils.ts` with `cn()`,
  installs `clsx` + `tailwind-merge` + `class-variance-authority` +
  `lucide-react` + `radix-ui` + `tw-animate-css`), but reverted the
  radix-nova preset's destructive parts: it had rewritten `Button.tsx` with
  dense `h-7`/`h-8`/`h-9` sizes that would have shrunk every marketing CTA,
  switched the brand-blue `--primary` to a grayscale OKLCH, and injected a
  duplicate Geist font import into `layout.tsx`. Kept the genuinely scalable
  pieces — the expanded token set (`--popover`, `--secondary`, `--chart-*`,
  `--sidebar-*` + the full radius scale) so future Dialog/Sheet/Sidebar
  primitives drop in without touching `globals.css`. `components.json` is
  now `style: new-york`, `baseColor: slate` (matches our blue brand).
- **Form primitives hand-rolled in shadcn v4 shape** — `Input`, `Label`,
  `Textarea`, `Card` (+ `CardHeader`/`CardTitle`/`CardDescription`/
  `CardAction`/`CardContent`/`CardFooter`), `Badge` (with a `tone` variant
  matching invoice statuses: neutral / info / success / warning /
  destructive). Each carries the `data-slot` attribute, uses
  `React.ComponentProps<...>` (no `forwardRef`), composes classes via
  `cn()`. Future `npx shadcn@latest add dialog` lands alongside.
- **`AppShell` server component** — sticky header (Logo · breadcrumbs ·
  ThemeToggle · SignOut) wrapped in `<Container>`, used by every authed
  page. The dashboard's hand-rolled header is gone; pages now declare
  `crumbs={[…]}` instead of inlining a back-link.
- **Welcoming copy on `/sign-in`** — the page now opens with
  "Welcome to AstraBill" (brand-gradient wordmark) and a one-sentence pitch
  ("Sign in to raise GST invoices, send them on WhatsApp, and get paid on
  UPI — all from your phone."), sign-in card centered in the viewport, Terms
  + Privacy footnote, and the "It's that simple." tagline at the bottom.

Constraints respected:
- `Button.tsx` and its `buttonClasses()` export are unchanged — marketing
  call sites (Hero, Header, Pricing, CtaBand) keep working untouched.
- `app/layout.tsx` unchanged — single Geist font source via `geist/font/sans`.
- Brand colors (blue `--primary`, gradient `--brand-from` → `--brand-to`)
  preserved in both light and dark.
- `Container` now uses `cn()` so callers' `max-w-*` reliably overrides the
  default via `tailwind-merge`.

Files: `components.json`, `lib/utils.ts`; `components/ui/{input,label,textarea,card,badge}.tsx`;
`components/app/AppShell.tsx`; `app/globals.css` (token expansion +
brand-restore merge); rewrote `app/sign-in/{page,SignInForm}.tsx`,
`app/dashboard/page.tsx`, `app/onboarding/{page,OnboardingForm}.tsx`,
`app/customers/{page,CustomerForm,new/page,[id]/edit/page}.tsx`,
`app/products/{page,ProductForm,new/page,[id]/edit/page}.tsx`,
`app/invoices/{page,[id]/page,[id]/InvoiceActions,[id]/edit/page,new/page,new/InvoiceForm}.tsx`;
`components/ui/Container.tsx` (cn() merge).

Wiki: DECISIONS.md unchanged (the Styling + Site structure rows already
covered Tailwind v4 + the route-group / app-shell split; shadcn adoption
was the *anticipated* path called out in those rows). decision/frontend-
architecture.md updated — the "shadcn deferred" paragraph is now "shadcn
adopted (F3)" with the rationale for the non-destructive merge and the
hand-rolled-vs-CLI tradeoff. overview.md thesis-evolution line added.

Typecheck clean. Dev-server smoke test: every migrated route returns 200.
The "app pass" branch of frontend work is now complete; further frontend
polish lands on top of this foundation.

## [2026-05-19] ingest | myBillBook competitor profile + Phase 2C scoped (Invoice Design System)

Wiki research caught a competitor gap: **myBillBook** (FloBiz, ~$40M
raised, "1 Crore+ businesses" on their landing) wasn't in the
competitor catalogue. The 6 landing screenshots ingested today show
their #1 paid-tier upsell is **brand-customizable invoices** — the
"Your bill, Your Brand: Color · Logo · Font · And More!" animated
hero, three template sizes (Thermal · A4 · A5), a "Customize your own
Invoice" drag-and-toggle builder, and "Special Themes" including a
Ganesha-watermarked variant.

Strategic implication: AstraBill's current PDF (one generic template,
no brand fields, no logo upload) does not clear the Indian SME
category's table-stakes bar. The "your customer sees your invoice
and knows it's *yours*" test is what converts a Day-1 free signup to
paid retention — and it's the artifact the future WhatsApp loop
delivers, so a generic PDF undermines the loop AstraBill is built
around.

Pages created:
- `wiki/competitor/mybillbook.md` — full profile, hero pitch
  verbatim, template catalogue, strengths/weaknesses, threat
  assessment. Updated `wiki/index.md`.
- `wiki/decision/invoice-design-system.md` — Phase 2C LLD. Template
  engine (parameterized per template, served from the PDF
  microservice), branding fields on `businesses` (`logo_url` already
  in schema, now wired up; new `brand_color`, `brand_font`,
  `invoice_template_id`, `invoice_settings` JSONB), Cloudinary
  signed-upload pipeline, `/settings/branding` UI with live preview,
  three V1 templates (Modern · Classic · Thermal 80mm), festive
  templates + column-toggle in 2C.5.

Wiki + DECISIONS realigned:
- `wiki/decision/phase-2-plan.md` — sequencing rewritten. **2C now
  lands before 2B.** Reason: 2C is unblocked codebase work;
  2B requires Meta WABA template verification + Razorpay KYC (both
  multi-week external blockers). Building 2C during that window
  means 2B's first WhatsApp send delivers a brand-customised PDF,
  not a generic one.
- `wiki/overview.md` — competitor differentiation table expanded to
  include myBillBook column + two new rows (brand-customizable PDF;
  themed templates). Thesis-evolution line added for the 2C-before-2B
  pivot.
- `wiki/index.md` — both new pages indexed.

`DECISIONS.md` left untouched in this entry — 2C's open questions
(default template, free-vs-paid branding gate, "Made with AstraBill"
footer, font set, brand-colour application breadth) are explicitly
listed in `decision/invoice-design-system.md` and resolved during
the build, not pre-decided in the SSOT.

Open question for the user: a couple of the 2C scope choices need
direction before migration 0003 opens — listed in the new decision
page's "Open questions" section.

## [2026-05-19] build | Phase 2C Stages 0–5 shipped — invoices render as branded PDFs

The Invoice Design System build. Eight planned stages; 0–5 done and
tested end-to-end (an invoice downloads as a real branded PDF).

- **Stage 0** `c70b908` — render contract + 4 fixtures.
- **Stage 1** `5b0d23f` — `pdf-service/`: Express + Puppeteer + React SSR.
- **Stage 2** `02c388c` — premium Modern template, multi-page handled
  (repeating header, no split blocks, per-page footer).
- **Stage 3** `f78fd4b` — migration 0003 (branding columns) + branding API.
- **Stage 4** `f8990ce` — Cloudinary signed logo upload (secure backend).
- **Stage 5** `bda31cd` — Next.js → pdf-service wiring, Download PDF button.
- Polish `b9cfdee`, `59fb4ce` — qty/GST zero-trim, line "Amount" is the
  pre-GST taxable value (reconciles with subtotal).

SSOT: thermal_80 cut from V1 → 2C.5 (reconciled across DECISIONS.md,
phase-2-plan.md, overview.md). Scale-to-fit deferred (noted in the
decision page's "Open during the build").

Remaining (next chat): wire the 3 newly-installed fonts (Poppins /
Noto Serif / Noto Sans) into `fonts.ts` + the templates; build the
Classic template; then Stage 6 — the `/settings/branding` UI as the
capstone. Full state in decision/invoice-design-system.md "Status".

## [2026-05-19] build | Phase 2C-1 complete — branding customization shipped

The Invoice Design System's V1 scope (2C-1) is done. Picking up from
Stages 0–5:

- **Fonts** `856dcbc` — `fonts.ts` embeds any of the four families
  (`fontFaceCss`); both templates' `font-family` follows
  `branding.font`; Poppins / Noto Sans carry their Devanagari subset.
- **Classic template** `5737c14` — the second real template (a ruled,
  traditional invoice with a signature block); the registry no longer
  aliases `classic` → Modern.
- **Stage 6** `3ee03ae` — `/settings/branding` (Template · Colors ·
  Font · Columns + logo upload), `GET /i/preview`, and a debounced
  live-preview iframe that renders through the real pdf-service.

2C ships before 2B as planned. Remaining 2C work is all 2C.5
(thermal-80, festive templates, the pharma column set + its template,
custom-T&C library). Full state in
decision/invoice-design-system.md "Status".

## [2026-05-19] build | Dynamic fit-to-page — invoices fill the A4 dynamically

User feedback on the just-shipped 2C-1: a short invoice's content read
small and stranded the bottom of the page — visibly less substantial
than myBillBook / Vyapar / Tally clones. Stage 2's tight 9.5px base
fit a 12-item invoice on one page at the cost of under-filling a
1–3-item one.

Reworked the renderer to be dynamic both ways. `fd6d66d`:

- Both templates' CSS converted to `rem` units (one root font-size
  drives the whole layout). Borders stay px so hairlines don't grow.
- `render.ts` measures `.doc` height after SSR and picks the root
  size that fills ~93% of A4. Short → scale UP (cap 16px), long →
  scale DOWN (floor 8.5px), genuinely long → default + paginate.
- Re-application via `page.evaluate` (inline style on `<html>`), no
  re-setContent. Total render ~165ms.

Replaces the originally-deferred one-directional scale-to-fit; the
shipped form handles UNDER-fill too. Updated
decision/invoice-design-system.md.

## [2026-05-19] build | Phase 2D Step 1 — white-label app shell foundation

User pushback: "we are randomly building stuff … the app should feel
like the owner's billing dashboard, not AstraBill's." The 2C work
made the *PDF* owner-branded; the *app shell* still said AstraBill,
opened to a business-picker card grid, and threaded `?businessId=` on
every URL. That mismatch is the gap 2D closes — parallel to 2C, but
on the chrome side.

Step 1 ships the foundation:

- `app/b/[businessId]/layout.tsx` — the ONE place a business is
  resolved + membership verified per request. 404 for non-members (no
  existence leak); the repository-level scoping stays as defence in
  depth.
- `components/app/BrandedAppShell.tsx` + `Sidebar.tsx` — sidebar with
  BusinessSwitcher (logo + name + dropdown), nav (Dashboard /
  Invoices / Customers / Products / Settings) with active state, a
  user menu + sign-out, and "Powered by AstraBill" at the foot.
  Branding is *subtle*: brand-colour shows on (1) the 2px left-edge
  accent of the active nav item and (2) the avatar fallback bg.
  Whole-sidebar-painted-brand-colour considered + rejected (gaudy at
  saturated user colours; contrast budget breaks).
- `lib/routes.ts` — SSOT for URL structure. `routes.b(id)` factory
  returns the family of business-scoped paths; pages never
  template-string a path.
- `app/dashboard/page.tsx` → smart redirect (no business → onboarding;
  has business → `/b/[mostRecent]/dashboard`).
- `app/b/[businessId]/dashboard/page.tsx` — placeholder (welcome +
  three "Coming soon" stat cards + quick-action buttons). Real KPIs
  in Step 3.
- `lib/services/businesses.ts` — new `getMostRecentBusinessForUser`.
- `proxy.ts` — added `/b/:path*` to the auth matcher.

Sidebar nav for non-dashboard sections still points to the OLD paths
(`/invoices?businessId=X` …) — a deliberate transitional gap. Step 2
of 2D migrates `/invoices`, `/customers`, `/products`,
`/settings/branding` under `/b/[businessId]/...`. Step 3 = real
dashboard KPIs. Step 4 = mobile (hamburger / drawer).

Decision page: `decision/white-label-app-shell.md`. Binding facts
added to DECISIONS.md under a new "Product — App shell & navigation
(Phase 2D)" section.

## [2026-05-19] build | Phase 2D Step 2 — pages migrated under /b/[businessId]/

Closed the transitional gap from Step 1. Invoices, customers,
products, and settings/branding all moved under /b/[businessId]/... —
every authed business page now renders inside the BrandedAppShell.

- businessId comes from the path param, not `?businessId=`.
- AppShell + crumbs dropped; pages render a new shared `PageHeader`
  (title / description / action) instead. AppShell stays only for
  /onboarding (the one non-business-scoped authed page).
- List pages are single-business now — the cross-business "Business"
  column and the business filter pills are gone.
- Detail/edit pages guard `row.businessId === params.businessId` so a
  crafted cross-business URL is a 404.
- Forms take a one-element businesses array, lock the <select>;
  redirects after save go through `routes.b(id)`.
- BrandingEditor lost its in-page business switcher (the sidebar owns
  switching). Sidebar nav uses canonical routes; proxy.ts + robots.ts
  drop the old top-level paths.

Verified with a clean production build — all 12 /b/[businessId]/*
routes resolve, no stale paths.

## [2026-05-19] build | Payment recording — the udhaar keystone

Stepped back mid-2D: customers + products are a working CRUD but the
*reporting* layer (customer udhaar, dashboard KPIs) was missing — and
it's all gated on one primitive that didn't exist. An invoice went
`draft → sent` and stayed `sent` forever; nothing was ever paid.

Built manual payment recording (the `payments` table already existed
in schema):

- `amount_paid` is derived — always `SUM(payments WHERE deleted_at IS
  NULL)`, never an incrementally-mutated counter. Status follows the
  sum (paid / partially_paid / sent) via one pure function.
- Record + void both lock the invoice row `FOR UPDATE`, so concurrent
  payments serialise and the re-sum can't lose a row.
- A void is a soft delete + recompute — the row stays, the audit log
  keeps both record + delete; correcting a typo = void + re-record.
- Payments only attach to finalised invoices.
- schema → repository → service → API (`POST /api/invoices/[id]/
  payments`, `DELETE /api/payments/[id]`) → `PaymentPanel` on the
  invoice detail page (summary bar + record form + history + void).

Decision page: `decision/payment-recording.md`. Binding facts in
DECISIONS.md under a new "Product — Payment recording" section.
Unblocks 2D Step 3 (real dashboard KPIs) and the customer udhaar view.

## [2026-05-19] build | Phase 2D Step 3 — real dashboard KPIs

The placeholder "Coming soon" cards on `/b/[businessId]/dashboard`
are now real numbers — possible only because payment recording
landed first (every figure is a function of what's been paid).

- Three KPIs: **outstanding** (`SUM(total - amount_paid)` over
  non-draft invoices — the udhaar headline), **paid this month**
  (`SUM(payments.amount)` since the 1st), **revenue this month**
  (`SUM(total)` over invoices issued since the 1st).
- **Recent invoices** — the six newest, with status + total,
  clickable through to the detail page.
- **Low stock** — active products at or below their alert threshold;
  the card only renders when there's something to flag.
- Layers: three SQL aggregate repo functions
  (`sumOutstandingForBusiness`, `sumRevenueForBusinessSince`,
  `sumPaymentsForBusinessSince`) + `listLowStockProducts` →
  `lib/services/dashboard.ts` (`getBusinessDashboard`, self-guarding
  on membership) → the rewritten dashboard page.
- "This month" is bounded at UTC midnight of the 1st — the IST skew
  at the boundary is an accepted V1 imprecision.

2D is now Steps 1–3 done; only the mobile shell (Step 4) remains.
No new decision page — this is Step 3 of `decision/white-label-app-
shell.md`, whose Status table is updated.

## [2026-05-19] build | Customer detail — the udhaar tracker

V1 feature #3 (udhaar tracker), seller side. `/b/[businessId]/
customers/[id]` — until now there was only a customer *edit* page;
no way to open a customer and see what they owe.

- Three udhaar KPIs: **outstanding** (`billed - paid` — what this
  customer still owes), **total billed**, **total paid** — all
  lifetime, computed over the customer's non-draft invoices
  (decimal.js, in the service).
- Contact card — phone / email / GSTIN / state / address / notes.
- Invoice history — every invoice for the customer, each with its
  own balance (`total - amount_paid`), click-through to the detail.
- Layers: `listInvoicesForCustomer` repo query →
  `getCustomerDetail` service (returns customer + invoices + stats,
  membership-scoped) → the new page. The customers list now links
  each name through to the detail page.
- `Kpi` card extracted to `components/app/Kpi.tsx` — shared by the
  dashboard and this page.

Real numbers throughout, possible because payment recording landed
first. No new decision page — a straightforward read view on top of
the payment primitive; `decision/payment-recording.md` Status
updated to mark the udhaar view shipped.

## [2026-05-19] build | Phase 2D Step 4 — mobile shell

The desktop sidebar was `md:`-only — below that breakpoint the app
had no navigation at all. For a mobile-first product where 90% of
WhatsApped invoices open on phones, that was a real gap.

- `Sidebar.tsx` split: the inner body extracted to a shared
  `SidebarContent` (BusinessSwitcher + nav + footer). The desktop
  `Sidebar` is now just the `<aside hidden md:flex>` wrapping it.
- New `MobileNav` — a sticky top bar (hamburger + business avatar +
  name) and a slide-in left drawer holding `SidebarContent`. The
  drawer is always mounted; opacity + transform toggle it so it
  slides and fades. Body scroll locks while open; Escape closes it;
  tapping a nav link closes it (via `SidebarContent`'s `onNavigate`).
- `BrandedAppShell` restructured — sidebar + a column holding the
  mobile header and `<main>`.

**Phase 2D is now complete** (Steps 1–4). The app feels like the
owner's branded billing dashboard on every screen size. Status tables
in `decision/white-label-app-shell.md` + `decision/phase-2-plan.md`
updated; no new decision page (Step 4 of an existing decision).

## [2026-05-19] build | Phase 2B kick-off — public invoice share

Two Meta WhatsApp templates submitted for review — `astrabill_invoice`
+ `astrabill_payment_reminder` — both Utility, with a dynamic URL
button pointing at `https://www.astrabill.com/i/{{1}}`. ETA ≈ 3h.
The button URL **locks the public-view path in stone** (changing it
later invalidates every sent invoice + needs a new template). So the
work this commit lands is the infrastructure the URL points at,
built first so it exists by the time Meta approves.

Built:

- `invoices.share_token` — text column, unique, nullable for drafts
  (`drizzle/0004_faithful_marvel_apes.sql`).
- `lib/share-token.ts` — `generateShareToken()`: 12 random bytes →
  16-char base64url (~96 bits of entropy; URL-safe; not the row
  UUID).
- `finalizeInvoice` now stamps both `number` AND `shareToken` in one
  transaction — invariant: a finalised invoice always has both.
- Unscoped repo reads: `getInvoiceByShareToken`, `findBusinessById`,
  `findCustomerById` — named `find*` (vs `get*ForUser`) to signal
  these skip tenant scoping; explicit comments warn off general use.
- `lib/services/public-invoice.ts` — `getPublicInvoiceView(token)`.
- `lib/services/invoice-pdf.ts` — `renderPublicInvoicePdfByToken`
  beside the existing auth-path renderer; both reuse
  `buildRenderRequest`.
- `/i/[shareToken]` page — mobile-first, brand-coloured accent
  stripe + button, full invoice readout, Download PDF CTA. Sets
  `noindex, nofollow` per page.
- `/api/i/[shareToken]/pdf` — public PDF endpoint, no
  `requireUser`; same pdf-service the authed download uses.
- `robots.ts` — `/i/` added to disallow list (belt-and-suspenders
  with the per-page noindex).

Auth model is **token IS the auth** — anyone with the URL sees the
invoice, by design. Same model as Stripe/Razorpay receipt links. No
rate limiting in v1.

Decision page: `decision/public-invoice-share.md`. Binding facts in
DECISIONS.md under a new "Product — Public invoice share" section.

Remaining for 2B (blocked on Meta approval): WhatsApp client module
+ "Send on WhatsApp" button on the invoice page +
`whatsapp_messages` logging.

## [2026-05-19] build | Phase 2B — WhatsApp send (hero loop end-to-end)

`astrabill_invoice` came back approved (~3h SLA). Built the rest of the
send loop on top of the public-share infrastructure shipped earlier
today.

What landed:

- `lib/repositories/whatsapp-messages.ts` — insert / mark-sent /
  mark-failed / list. Rows are immutable history (no soft-delete) —
  the table reflects the audit trail directly.
- `lib/services/whatsapp-send.ts` — `sendInvoiceOnWhatsApp` and
  `listInvoiceWhatsAppSends`. The service is the only file that knows
  the `astrabill_invoice` body-var order, language code, and URL-
  button binding. Guards: membership (404), `whatsapp:send` (403),
  finalised-only (409), customer-must-have-phone (422). Lazy
  share_token backfill for pre-2B finalised invoices via a race-safe
  conditional UPDATE. Transport-layer whitespace sanitisation against
  Meta's #131008.
- `POST /api/invoices/[id]/send-whatsapp` — a thin route. Maps
  service errors to HTTP via the standard wrapper.
- `WhatsAppPanel` card on the invoice detail page — send / resend
  button (label flips after the first send), masked phone display,
  full send history list with per-row status badges and error
  messages. Inline-status UX consistent with `PaymentPanel`; no toast
  library introduced.

What did NOT land here: `astrabill_payment_reminder` still in review
(not blocking — utility template for the V2 reminder cron), and the
Razorpay leg of 2B is separate work.

DECISIONS.md gained a "Product — WhatsApp invoice send (Phase 2B)"
section; rationale on the *why* lives at
[[decision/whatsapp-invoice-send]] (no fact restatement).

## [2026-05-20] build | astrabill_invoice_v1 — URL fix + template recreate

First real test send revealed Meta's URL-button gotcha. The v0 template
had `{{1}}` typed into the URL field; Meta preserved it literally and
*appended* the share_token after it, producing
`https://www.astrabill.com/i/{{1}}CwoI8ZxIJyzqSFiw` — a broken link.

The actual mechanic, confirmed by Meta's own tooltip ("Only one variable
can be added to the end of a URL.") and the docs: URL buttons **append**
the variable to a static base. The base URL field never contains
`{{1}}`; that placeholder shows in the UI only as a visual hint of
where the appended value lands.

Approved templates can't have their URL button edited — Meta's editor
throws "error saving" when you try. So the v0 was abandoned and a fresh
template `astrabill_invoice_v1` submitted with:

- URL base `https://www.astrabill.com/i/` (no `{{1}}` typed in)
- Sample URL `https://www.astrabill.com/i/abc123xyz`
- Body text identical to v0

Code change: `INVOICE_TEMPLATE` constant in `lib/services/whatsapp-send.ts`
flipped from `astrabill_invoice` to `astrabill_invoice_v1`. Template
naming now matches the `astrabill_otp_v1` convention.

DECISIONS.md row + the public-invoice-share rationale page corrected
to reflect "append, not substitute" — this was a real misconception
in the original docs.

Template is in review. Once Active, retest a fresh invoice send.

## [2026-05-20] build | Phase 2B end-to-end on production

The hero loop is live on `www.astrabill.com`. Three things landed today
that together close the loop:

1. **`astrabill_invoice_v1` approved** by Meta — Active - Quality. The
   v0 template was abandoned because its URL field had `{{1}}` typed
   into it (Meta appends, doesn't substitute — so the v0's button
   produced `/i/{{1}}<token>`). v1 uses base `https://www.astrabill.com/i/`
   with no `{{1}}` in the field; Meta appends the share_token cleanly.

2. **AstraBill phone number registered with the Cloud API.** Added
   `+91 87553 48646` to the Opryon Labs WABA, verified ownership via
   OTP, then ran `POST /1164926513361309/register` with a 6-digit PIN
   (saved to `.env.local`). The number is now Connected; display name
   "AstraBill by Opryon Labs" is still in Meta review — sends will
   arrive branded as GymPilot until that clears (cosmetic only; URL +
   body work today).

3. **9 commits pushed to `origin/main`.** The entire 2D + 2B + URL-fix
   stack went out in one Vercel deploy. Public `/i/[shareToken]` +
   `/api/i/[shareToken]/pdf` verified on `astrabill.com` against a
   freshly-finalised invoice; the WhatsApp message's "View invoice"
   button resolves to the clean URL and the public page renders the
   real invoice (brand colour, line items, GST breakdown, totals).

**4 of 4 V1 features are now real on production:** GST invoice + PDF ·
WhatsApp send · udhaar tracker · inventory. Razorpay is the only V1
piece left.

DECISIONS.md gained an "Environments" row (dev = prod, single Supabase
project for now) — codifying the operational reality and the
discipline it requires. Rationale at [[decision/infrastructure]].

The template row was updated to "Approved" status; the public-share +
WhatsApp-send rationale pages already capture the append-not-substitute
correction from yesterday.

`astrabill_payment_reminder` is still in Meta review — flagged as
likely needing rewording ("a friendly reminder", "Tap the button
below…", "We appreciate your prompt payment" all read as marketing
copy in Utility category). User will delete + recreate with cleaner
copy as `astrabill_payment_reminder_v1`. Not blocking; it's for the V2
reminder cron.

## [2026-05-20] build | Phase 2E complete — UI refinement live on production

All four steps of Phase 2E (foundation → invoice form → propagate →
polish) shipped and pushed to `origin/main`. 11 commits went out in the
deploy. The app that landed on `astrabill.com` today is the one the
user finally pointed at and said "looks better than before."

**Step 0 — Foundation.** Warm-paper palette (page `#FAFAF7`, cards
pure white, primary `#1E40AF`), `defaultTheme="light"`, spacing +
typography scale documented in the `globals.css` header comment,
[[decision/ui-refinement-phase-2e]] written. Soft-tinted Badge pills
replaced saturated solids; `Card` gained `shadow-sm dark:shadow-none`
elevation; sidebar split into Workspace + Settings groups.

**Step 1 — Invoice creation form.** Full myBillBook layout-for-layout
match: sticky top action bar on md+ (title + Cancel + Save), Bill To
card (left) + Invoice details card (right) at the top, line items
table full-width with 9 always-visible columns (Item / HSN / Qty /
Unit / Price / Discount / GST / Amount + ✕), "+ dual-unit billing"
toggle gating only the niche 2nd-qty pair, four accordions (Ship-to ·
Extra charges · Transport · Notes) bottom-left, Totals card
bottom-right inline (not sticky — myBillBook's pattern), sticky-bottom
Save bar on mobile only (`md:hidden`). PageHeader dropped from
`new/page.tsx` and `edit/page.tsx` since the form now owns its title.
Pre-rebuild the form lost width to a 320px sticky right rail and the
HSN cell truncated; the rebuild gives every column its 6-9rem floor.

**Step 2 — Propagate.** Invoice detail page got the same two-column
rhythm as the form: a Bill to + Invoice meta split at the top, line
items full-width, Totals card anchored bottom-right via a
`grid-cols-[minmax(0,1fr)_360px]`. Replaces the orphaned
`ml-auto max-w-sm` Totals card that floated alone with no left-side
context.

**Step 3 — Polish.** Four things landed:

1. **`EmptyState` primitive** (`components/app/EmptyState.tsx`) —
   icon tile + headline + sub-line + CTA, wrapped in a `<Card>`. Wired
   into the empty states on `/invoices`, `/customers`, `/products`.
   The bland "No customers yet." became a real first-touch surface.

2. **`sonner` toast** (`components/ui/Toaster.tsx` mounted once in
   `app/layout.tsx`, theme follows next-themes via `resolvedTheme`).
   Every inline destructive-banner pattern across the six client
   surfaces (InvoiceForm · CustomerForm · ProductForm · InvoiceActions
   · WhatsAppPanel · PaymentPanel) replaced with `toast.error()`. The
   inline-banner pattern from F3 was the half-cooked one this phase
   exists to eliminate.

3. **`Skeleton` primitive** (`components/ui/skeleton.tsx`) — soft
   muted pulse using the same `bg-muted` token as cards. `loading.tsx`
   shells on the three highest-traffic / heaviest server pages:
   dashboard, `/invoices` list, `/invoices/[id]` detail. The detail
   page does four parallel DB reads (payments, sends, membership,
   customer) before paint — it benefits most.

4. **Focus rings.** A single `a:focus-visible` rule in `globals.css`
   draws a 2px ring at `--ring` with 2px offset. Button primitive
   already carried its own ring, so this hits inline anchors like
   "View →", "Edit →", and sidebar / breadcrumb links. Keyboard
   navigation is now visible across the surface.

After this deploy the only V1 piece left is **Razorpay** — the UPI
payment link that closes the loop the WhatsApp send opened. The "Pay
Now" button arrives into a polished visual language and inherits the
discipline instead of layering on top of unrefined UI.

## [2026-05-21] decision | UPI deep links replace Razorpay for V1

Sitting down to build the Razorpay leg surfaced the flaw in our own
plan. Two questions broke it:

**1. Whose Razorpay account holds the money during pilot?**

   - *Platform-shared* (one AstraBill key for everyone): money flows
     through Opryon's Razorpay → Opryon's bank → manually transferred to
     the shop. That makes Opryon the merchant of record. PA/PG license
     territory. Books absorb the shop's revenue. Doesn't scale past
     customer #1. DECISIONS.md already had `"never become a payment
     gateway / route money"` — platform-shared violates it.
   - *Per-merchant connected*: architecturally correct, but every shop
     onboards with Razorpay (KYC + business proof + bank linking)
     **before they can take their first payment**. That's the exact
     friction we set out to remove.

**2. What does the gateway actually buy us?**

   UPI MDR is 0% (NPCI mandate). 95% of Indian SME collections are UPI
   today. Cards are vanishingly rare in our segment. The gateway's real
   value is *auto-reconciliation*, not the rails. And we can ship that
   as a V1.x upsell once the loop is real.

**Pivot.** Ship UPI deep links to the shop's own VPA. The schema already
has `businesses.upi_id`. The deep link is a single NPCI-defined string:

```
upi://pay?pa=<vpa>&pn=<name>&am=<total>&tn=<inv-no>&cu=INR
```

Render it as a "Pay ₹X via UPI" button + QR code on the public share
page and the invoice PDF. Customer taps → their UPI app opens
pre-filled → pays → money goes peer-to-peer customer's bank → shop's
bank. AstraBill never touches the funds. The shop sees a bank SMS and
records the payment via the existing `Record payment` flow that
[[decision/payment-recording]] already built.

What we give up: auto-reconciliation. The shop reconciles manually
from bank SMS — exactly what they did before AstraBill, except now
there's a place to record it with full history. V1.x value, not V1
blocker.

What we keep: the schema (`payments.razorpay_payment_id`,
`razorpay_order_id` sit unused, ready for V1.x), the payment-recording
machinery, and the explicit "never become a gateway" stance — UPI deep
links *reinforce* it (money never flows through us).

`IPaymentProvider` interface is **not written speculatively**. It
arrives the day a real provider is needed.

**Files touched:**

- `DECISIONS.md` — replaced the single "Payments | Razorpay" row with
  two rows: `Payments (V1)` = UPI deep links, `Payments (V1.x)` =
  per-merchant Razorpay (never platform-shared).
- `wiki/decision/upi-deep-links.md` — new, full rationale.
- `wiki/decision/payment-gateway.md` — banner at the top marking it
  superseded for V1; reasoning preserved as background for the V1.x
  reintroduction.
- `wiki/index.md` — new entry, old entry annotated.

Code work starts next: VPA validation in settings, share-page Pay
button + QR, PDF QR. Schema is already in place; no migration needed.

## [2026-05-21] ops | pdf-service droplet bring-up

Wiring the UPI QR onto invoice PDFs exposed a quiet truth: the
pdf-service has never been deployed to prod. Every PDF download on
`astrabill.com` returns `SERVICE_UNAVAILABLE` because
`PDF_SERVICE_URL` was never set on Vercel. Dev has it pointing at
`localhost:4000`; prod has nothing. The 2C invoice templates have been
"live" only in the sense that they exist in the repo.

This is the moment to fix it properly. Decisions made:

- **One dedicated droplet** ($12/mo, 2GB RAM, Ubuntu 24.04 LTS, BLR1).
  The $6 plan (1GB) doesn't have headroom for Puppeteer — Chromium
  alone wants ~500MB idle, and one concurrent render spike OOMs the
  box. $6/mo extra for headroom is the right trade.

- **One droplet, multiple containers via Docker Compose.** Today:
  Caddy + pdf-service. The compose file leaves room for the future
  BullMQ worker + Redis to land as additional services on the same
  droplet — that's the trajectory `wiki/decision/infrastructure.md`
  has had all along. Splitting microservices across droplets is the
  textbook over-engineering trap at our scale; we co-locate until one
  service genuinely needs its own box.

- **Caddy, not nginx + certbot.** Auto-TLS via Let's Encrypt with
  ~10 lines of config and zero renewal cron jobs. Nginx + certbot is
  fine and traditional, but at MVP it's strictly more moving parts
  for the same outcome. Cloudflare must stay in DNS-only (grey-cloud)
  mode for `pdf.astrabill.com` — orange-cloud terminates TLS at
  Cloudflare's edge and Caddy can't complete the HTTP-01 challenge.

- **`deploy/` directory checked into the repo.** Contains
  `docker-compose.yml`, `Caddyfile`, `.env.example`, and `README.md`
  (the bring-up + redeploy runbook). Redeploy is one command on the
  droplet — `git pull && docker compose up -d --build pdf-service`.
  No image registry needed for now (build on the droplet from the
  pinned commit); we add a registry the day build time on the droplet
  becomes a bottleneck.

- **Subdomain `pdf.astrabill.com`.** Vercel env gains
  `PDF_SERVICE_URL=https://pdf.astrabill.com` and
  `PDF_SERVICE_TOKEN=<shared secret>`. Future services that need
  public endpoints get their own subdomain; internal-only services
  (BullMQ workers, Redis) get no subdomain at all.

`wiki/decision/infrastructure.md` updated to reflect the $12 plan
choice + the Docker Compose pattern. The full operational runbook
lives at `deploy/README.md`. Bring-up walks through DO droplet
creation → DNS → SSH hardening → Docker install → repo clone →
`docker compose up -d` → Vercel env wiring → end-to-end smoke test.

## [2026-05-21] build | Phase 2F complete — pdf-service live on prod + UPI deep links

**pdf-service droplet brought up end-to-end.**

- **Droplet:** `astrabill-prod`, DigitalOcean BLR1, Basic AMD, 1 vCPU / 1GB RAM / 25GB SSD, $7/mo, Ubuntu 24.04 LTS. Non-root user `asmit` with sudo; root SSH login disabled; password auth disabled (key-only).
- **Firewall:** ufw — deny all incoming except 22/80/443. fail2ban installed. 2GB swap added (`/swapfile`) for Puppeteer headroom.
- **Docker:** v29.5.2, Compose v5.1.4, installed via official Docker apt repo.
- **Repo cloned to `/opt/astrabill`.** GitHub credentials cached via `git config --global credential.helper store`.
- **Stack brought up:** `docker compose up -d --build` from `/opt/astrabill/deploy/`. Caddy + pdf-service both healthy.
- **TLS cert issued** by Let's Encrypt for `pdf.astrabill.com` via HTTP-01 challenge (Cloudflare DNS-only / grey cloud).
- **Smoke test passed:** `curl -i https://pdf.astrabill.com/health` → `{"ok":true,"service":"astrabill-pdf-service"}`.
- **Vercel env wired:** `PDF_SERVICE_URL=https://pdf.astrabill.com` + `PDF_SERVICE_TOKEN` added to Production + Preview scope. Redeploy triggered.
- **End-to-end verified:** PDF downloaded from `astrabill.com` — brand colour, logo, line items, GST breakdown, totals all correct. `SERVICE_UNAVAILABLE` is gone.

**UPI deep links shipped (same deploy):**

- `lib/upi.ts` — `buildUpiPayUrl` + `renderUpiQrSvg` + `renderUpiQrDataUrl` helpers.
- `businesses.upi_id` exposed via `/settings/payments` (new page + SettingsNav).
- Share page `/i/[shareToken]` — Pay button + QR block for unpaid invoices with a VPA set.
- PDF footer — QR code rendered when `upiQrDataUrl` present in contract.
- Money flows peer-to-peer (customer's bank → shop's bank). AstraBill never touches it. Manual reconciliation via existing Record Payment flow.

**All 4 V1 features are real on prod:** GST invoice + PDF · WhatsApp send · udhaar tracker · inventory. Razorpay deferred to V1.x (per-merchant connected, never platform-shared).

## [2026-05-21] pivot | Full-ledger direction — AstraBill becomes GST books, not billing loop

User's market research surfaced that Indian SMEs need Customer + Supplier (Party) tracking — primarily for **Input Tax Credit (ITC)** reconciliation, which is mandatory for GST businesses. Decision: copy myBillBook's architecture, then improve.

Created:
- `wiki/competitor/mybillbook-architecture.md` — teardown of their sidebar + Create Party form (from 4 screenshots, 2026-05-21)
- `wiki/decision/full-ledger-pivot.md` — rationale + scope of the pivot

Supersedes `decision/v1-scope.md` (billing-loop framing). DECISIONS.md V1-scope row will be updated once the 7 open architectural questions in the pivot doc are resolved.

User framing: *"lets just fucking go and copy everything of billbook then we will make it better."* No real data in DB → no migration constraints, free to redesign the domain schema. Keep infrastructure (auth, multi-business, theming, PDF, WhatsApp, UPI, marketing site, deployment).

## [2026-05-21] build | PR1 schema — full-ledger pivot

`lib/db/schema.ts` drafted end-to-end; `drizzle/0005_cynical_ultimates.sql`
generated and reviewed. 22 new tables, 10 new enums, 13 additive columns
on `businesses`. Zero `DROP` statements — old domain (`customers` /
`products` / `invoices` / `invoice_line_items` / `payments` / legacy
`stock_movements`) untouched and still operable.

New domain:
- Parties: `parties`, `party_categories`, `party_addresses` (one billing
  enforced by partial UQ; many shipping), `party_bank_accounts` (multiple
  allowed per AstraBill deviation D1), `party_contact_persons`,
  `party_custom_field_definitions` + `party_custom_field_values`.
- Items: `items`, `item_categories`, `item_units` (seeded reference,
  data seed deferred), `item_party_prices`, `item_custom_field_definitions`
  + `item_custom_field_values`, `item_stock_movements` (renamed to
  `stock_movements` in PR2).
- Money + docs: `money_accounts`, `documents`, `document_line_items`
  (item snapshot fields), `document_additional_charges`,
  `document_counters` (per-business × doc_type × FY).
- Payments + ledger: `payment_entries`, `payment_entry_allocations`,
  `ledger_entries` (one table for party + money-account ledgers, with
  CHECK invariants).

Schema-level decisions locked during cross-questioning (rows added to
DECISIONS.md, "Product — V1 (Full-Ledger Pivot)" section):
- `stock_movements` rename plan — new table is `item_stock_movements`
  in PR1; PR2 atomically drops legacy + renames.
- GST rate semantics — `NULL = exempted`, `0 = nil-rated`, `> 0 = taxable`.
- DB-level CHECK constraints on `ledger_entries` (one side, positive
  amount, one ledger), `payment_entries` (amount > 0), `documents`
  (grand_total ≥ 0, finalised rows must have a number),
  `document_counters` (next_sequence ≥ 1),
  `document_additional_charges` (taxable rows must carry a gst_rate),
  `payment_entry_allocations` (allocated_amount > 0).

`businesses` extensions (additive, all with sensible defaults):
`pan_number`, `is_gst_registered`, `business_type` jsonb, `industry_type`,
`business_registration_type`, `signature_url`, `signature_mode`,
`signatory_name`, `additional_details` jsonb, `doc_type_defaults` jsonb,
`fy_start_month`, `enable_tds`, `enable_tcs`.

Deferred from this PR (intentional):
- `item_units` data seed (system unit list) — separate seed migration.
- "Cash Sale" party auto-creation — service layer at business creation.
- `users.last_business_id` — DECISIONS marks as follow-up.
- `relations.ts` update — flat reads are the V1 norm
  (`database-and-rbac` rule); relations get added when the new domain
  layer needs them.

Migration applied: not yet — awaiting human review of the SQL before
`npm run db:migrate` (which immediately reaches prod under the shared
Supabase project).

## [2026-05-21] build | PR2 Step 1 — pivot foundations (item_units seed + Cash account + Cash Sale party)

Foundations for the full-ledger pivot. Three things:
1. `drizzle/0006_seed_pivot_foundations.sql` — 41 system `item_units` (UQC list: PCS, KGS, MTR, SQF, SQM, LTR, NOS, …); backfill for existing businesses (idempotent): default `Cash in hand` money_account, "Cash Sale" walk-in party, per-doc-type T&C defaults seeded onto `businesses.doc_type_defaults`.
2. `lib/constants/{item-units,doc-type-defaults}.ts` — canonical TS copies + `applyCityPlaceholder()` helper (substitutes the literal `[CITY]` with `businesses.city` at render — improvement on myBillBook's literal `[ENTER_YOUR_CITY_NAME]`).
3. Tenant-scoped repos + service skeletons for `money_accounts` and `parties` (read paths + idempotent seed helpers). `createBusiness` now runs the trio (default cash + Cash Sale + doc_type_defaults) in the same tx.

Commit: `69faf59`.

## [2026-05-21] build | PR2 Step 2 — parties UI (full CRUD)

Replaces customers as a domain concept. List page with type counts (Customer / Supplier), detail page (4-card grid), form (Type pill, GST&PAN, Credit terms, Contact person, Notes), `party:*` RBAC mapped for every role, soft-delete-aware, Cash Sale structurally undeletable. Sidebar gets "Parties" entry; legacy Customers stays for the duration.

Commit: `586031c`.

## [2026-05-21] build | PR2 Step 3 — items + categories + adjust stock

Items UI + Item Categories CRUD (workspace-scoped, soft-delete-aware, inline-create in the item form) + Adjust Stock modal. Stock model done **properly**: opening stock IS the first `item_stock_movements` row (txn_type='opening_stock'); every write goes through `SELECT … FOR UPDATE` lock on `items` with `closing_stock_after` computed inline as `(SELECT SUM(qty) + new)::text` so concurrent writes serialise per item. Items list KPIs (Stock Value · Low Stock · Total) use batch helper `getCurrentStockForItems`; detail page renders chronological stock movements ledger with signed quantities + closing snapshots.

Commit: `8e4da26`.

## [2026-05-21] build | PR2 Step 4 — Cash & Bank with ledger-backed balances

`money_accounts` UI + Add/Reduce/Transfer flows, all posting to `ledger_entries`. `ledger-entries` repo has `insertLedgerEntryTx` (with invariant guards), `balanceForParty` / `balanceForMoneyAccount` (single-row + batch), `listEntriesFor*`, `findTransferPair`. Service writes the opening_balance ledger row at create when openingBalance > 0; transfer writes a paired `transfer_out`/`transfer_in` with a shared `transfer_pair_id`. Delete refused unless balance == 0 (book invariant). `money_account:{view,manage,adjust,transfer}` permissions added.

Commit: `1f1ef79`.

## [2026-05-21] build | PR2 Step 5 — documents service (the transactional spine)

The heart of the books. `document_counters` repo with FOR UPDATE locking + ON CONFLICT DO NOTHING race handling; `reserveNextNumberTx` is the only way to consume a number. `fyTokenFromDate` derives Indian FY from any date. `renderTemplate` resolves `{PREFIX}` / `{FY}` / `{SEQ:N}` tokens. Documents service:
- `createDocument` / `updateDocument` (drafts only) — line items + additional charges replaced wholesale; GST math via existing `lib/gst.ts` (back-calc on inclusive-tax pricing).
- `finaliseDocument` — ONE TX: reserve number → mark finalised → post ledger leg if `POSTING_POLICY[docType].ledgerSide` is set → write stock movements per line if `policy.stockDirection` is set. Covers all 8 doc types via the policy table.
- `cancelDocument` — ONE TX: write `voucher_type='reversal'` rows (sides flipped, originals' `reversed_by_ledger_entry_id` set) + negated stock movements (`manual_adjustment` since the stock enum has no generic reversal value; narration carries audit context).
- `deleteDraftDocument` — drafts only.

API: `/api/documents` (POST/GET), `/api/documents/[id]` (GET/PATCH/DELETE), `/api/documents/[id]/finalise` (POST), `/api/documents/[id]/cancel` (POST). `document:{view,create,finalize,cancel,delete}` permissions added. UI lands in Step 6.

Commit: `1c49653`.

## [2026-05-21] build | PR2 Step 6 — sales invoice UI (list + form + detail + finalise/cancel)

End-to-end customer-facing surface for the most-used doc type. `SalesInvoiceForm` does client-side totals preview via `decimal.js` (subtotal / discount / taxable / CGST+SGST or IGST / round-off / grand total); server runs `lib/gst.ts` on save (persisted figure is authoritative — footer note). Two save paths: "Save as draft" (POST/PATCH `/api/documents`) and "Save & finalise" (POST then POST `/finalise`). T&C seeded from `businesses.doc_type_defaults.sales_invoice.termsConditions` with `[CITY]` substituted via `applyCityPlaceholder`. Detail page renders 3 KPIs (Bill To / Invoice info / Status) + line items + additional charges + notes/T&C + totals breakdown. Status-aware actions: draft → Edit · Finalise · Delete draft; unpaid/partial_paid → Cancel.

Commit: `7d808c6`.

## [2026-05-21] build | PR2 Step 7 — Payment In + two-leg ledger posting

`recordPayment` writes EXACTLY 2 ledger rows in one tx: party leg (credit on payment_in, debit on payment_out) + money-account leg (debit on payment_in, credit on payment_out). Optional 3rd leg for settlement discount (no cash leg — writes off the receivable). Refreshes `documents.amount_received` + status from non-cancelled allocations; preserves cancelled status (cancelled stays cancelled). `cancelPayment` writes `voucher_type='reversal'` rows + re-derives. `statusFromAmounts` exported as a pure helper.

UI: `RecordPaymentModal` (single-doc allocation), `CancelPaymentButton`, Payment History card on the invoice detail page (Date / Mode / Reference / Amount / Status / Void link). The hero loop now works end-to-end: create draft → finalise (number assigned, party debited, stock movements written) → record payment (party credit + cash debit, status flips to paid).

Commit: `6077d7d`.

## [2026-05-21] build | PR2 Step 8 — other 4 doc types + Convert + Payment Out

Layers the V1 remaining doc types (quotation, credit_note, purchase_invoice, debit_note) on the documents pipeline. Shared components under `components/documents/`:
- `DocumentForm` — parameterised by `docType` via `TYPE_CONFIGS` map. Same UX as SalesInvoiceForm with per-type labels (Bill to / Bill from / Quote to), Validity-date vs Due-date label, conditional Original Doc Number fields (required for purchase_invoice + debit_note for ITC).
- `DocumentDetailView` — server component read surface, takes a `headerActions` slot + optional `paymentHistorySlot`.
- `DocumentListView` — shared list table with type-aware KPIs.
- `DocumentActions` — FinaliseButton / CancelDocumentButton / DeleteDraftButton / ConvertToInvoiceButton.
- `RecordPaymentModal` — generic, `entryType` prop drives payment_in vs payment_out.

Service additions:
- `convertQuotationToInvoice` — copies lines + charges + metadata into a new sales_invoice draft, sets `source_doc_id` for lineage, writes a "document.convert" audit. Refused on draft / cancelled quotations.

Per-type routes (each ~80-line wrapper): `/sales/quotations`, `/sales/credit-notes`, `/purchases/purchase-invoices`, `/purchases/debit-notes` — each with list / new / detail / edit. Sidebar gets 4 new entries.

Commit: `f282c8a`.

## [2026-05-22] build | PR2 Step 9 — reports (9 surfaces)

Full V1 reports landing. `lib/services/reports.ts`:
- `getSalesRegister` / `getPurchaseRegister` — date-range filtered.
- `getPartyStatement` — opening balance (sum before `from`) + windowed entries + closing balance.
- `getAgeing` — per-party bucketed (0-30 / 31-60 / 61-90 / 90+). Receivables: sales_invoice positive + credit_note negative. Payables: purchase_invoice positive + debit_note negative.
- `getHsnSummary` — line items grouped by (hsn, gst_rate); sales/purchase toggle.
- `getStockSummary` — products with SUM(stock_movements.qty) + stock_value.
- `getGstr3bSummary` — outward taxable / zero-rated / exempt split; CGST/SGST/IGST totals; net GST payable.
- `getGstr1B2b` + `gstr1B2bToCsv` — B2B sheet with GST-portal-compatible CSV.

UI: 9 page routes under `/b/[id]/reports/...` + 1 CSV API route. Shared `DateRangeFilter` (pushes `?from=&to=`, `currentFyBounds()` default), shared `AgeingTable`. Sidebar: "Reports" entry.

Commit: `40393c4`.

## [2026-05-22] build | PR2 Step 10 — onboarding wizard + sidebar IA refresh

3-step wizard (per `decision/full-ledger-pivot`): Business setup → Numbering seed → First party prompt. Step 2 POSTs to a new `/api/document-counters/seed` route — `seedCountersForBusiness` upserts the per-(business, docType, fyYear) row, refuses to push `next_sequence` backwards below an already-issued number. Inline stepper at top shows progress + completed-in-green.

Sidebar refactored from flat into IA groups via a tiny `NavGroup` helper: General (Dashboard / Parties / Items / Cash & Bank) · Sales (Sales invoices / Quotations / Credit notes) · Purchases (Purchase invoices / Debit notes) · Insights (Reports) · Legacy (Invoices/Customers/Products — labelled "(legacy)") · Settings. The Legacy group makes it visible what retires when Step 11 lands.

Commit: `458b2ab`.

## [2026-05-22] plan | PR2 Step 11 (atomic demolition) — what still needs to happen

Three cross-domain surfaces still depend on legacy tables and need migration BEFORE the SQL drop:

1. **Dashboard `/b/[id]/dashboard`** — reads `getBusinessDashboard` which sums legacy `invoices`. Needs to swap to documents + ledger_entries (`documents.status in ('unpaid','partial_paid')` for outstanding; sum of payment_entries this month for paid; sum of finalised documents this month for revenue; low stock from `item_stock_movements`).
2. **Public share `/i/[shareToken]`** + `/api/i/[shareToken]/pdf` — read `invoices.share_token`. The new `documents.share_token` exists with the same shape; need to swap the read path. Once switched, finalised documents render at the same `/i/<token>` URL.
3. **WhatsApp send** (`/api/invoices/[id]/send-whatsapp`) — sends the legacy invoice via the `astrabill_invoice_v1` Meta template. Either rewrite as `/api/documents/[id]/send-whatsapp` (recommended — same template, just points at the new domain) or punt to a post-demolition follow-up.

Demolition SQL migration (atomic):
- `DROP TABLE customers, products, invoices, invoice_line_items, payments, stock_movements` (legacy product-bound one)
- `ALTER TABLE item_stock_movements RENAME TO stock_movements`
- `ALTER TABLE businesses DROP COLUMN bank_name, bank_account_number, bank_ifsc, bank_account_holder, invoice_terms, invoice_number_prefix` (superseded by money_accounts + doc_type_defaults + document_counters)
- `DROP TYPE invoice_type, invoice_status, unit, stock_movement_type` (legacy enums)

Code-side deletion:
- `app/api/customers/`, `app/api/invoices/`, `app/api/products/`, `app/api/payments/`
- `app/b/[businessId]/customers/`, `app/b/[businessId]/invoices/`, `app/b/[businessId]/products/`
- `lib/repositories/{customers,invoices,products,payments,stock-movements}.ts`
- `lib/services/{customers,invoices,products,payments,invoice-pdf,public-invoice,whatsapp-send,dashboard}.ts` (dashboard gets replaced not deleted)
- `lib/schemas/{customer,invoice,payment,product}.ts`
- `customer:*` + `product:*` permissions from `lib/rbac.ts`
- Legacy entries from `routes.ts` (customers / newCustomer / customer / editCustomer / invoices / newInvoice / invoice / editInvoice / products / newProduct / editProduct) and the Legacy sidebar group.

Supabase snapshot before the migration runs (DECISIONS calls for this even with no real users). Suggested sequencing: ship the 3 cross-domain migrations as separate commits first (each verifiable in isolation), then one final atomic demolition commit that drops the code + runs the migration together.
