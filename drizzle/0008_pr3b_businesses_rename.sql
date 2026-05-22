-- PR3b — businesses columns: rename live invoice_* → document_*, drop dead.
--
-- Naming hygiene continuation after PR2's full-ledger pivot. Four columns
-- still carried `invoice_` prefixes that misled readers given the 8 doc
-- types now sharing the render path. Two are live (rename), two are dead
-- (drop):
--
--   LIVE — rename:
--     invoice_template_id   → document_template_id   (modern | classic, used)
--     invoice_settings      → document_settings      (jsonb, column toggles)
--
--   DEAD — drop:
--     invoice_terms         (superseded by businesses.doc_type_defaults
--                            jsonb — per-doc-type T&C defaults — and never
--                            read by any code path)
--     invoice_number_prefix (superseded by document_counters table —
--                            per-doc-type, per-FY counters — and never
--                            read by any code path)
--
-- Pre-flight: grep confirmed both DEAD columns have ZERO callers in lib/,
-- app/, components/. The live renames are mechanical — every consumer is
-- updated in the same commit.
--
-- LEGACY bank_* columns and upi_id are deliberately NOT touched here.
-- They are still the live source for PDF bank/UPI blocks; migrating those
-- readers to money_accounts is a separate PR (PR3d).

BEGIN;

-- ─── 1. Drop dead columns ────────────────────────────────────────────────
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "invoice_number_prefix";
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "invoice_terms";

-- ─── 2. Rename live columns ──────────────────────────────────────────────
ALTER TABLE "businesses" RENAME COLUMN "invoice_template_id" TO "document_template_id";
ALTER TABLE "businesses" RENAME COLUMN "invoice_settings"    TO "document_settings";

COMMIT;
