# AstraBill Wiki Log

Append-only. Format: `## [YYYY-MM-DD] <operation> | <title>`

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
