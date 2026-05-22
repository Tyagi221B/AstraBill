-- PR2 Step 11 — atomic demolition of the legacy domain.
--
-- The new domain (parties · items · documents · payment_entries · ledger_entries ·
-- money_accounts · item_stock_movements) has been running side-by-side since PR1.
-- This migration tears down the legacy tables, renames item_stock_movements to
-- stock_movements, and rewires whatsapp_messages from invoice_id → document_id.
--
-- Order matters: the FK from whatsapp_messages → invoices must be dropped
-- BEFORE invoices is dropped; legacy stock_movements (product-bound) must be
-- dropped BEFORE the new item_stock_movements rename takes the same name.
--
-- Pre-flight snapshot taken before PR2 began per wiki/log.md (2026-05-21).

BEGIN;

-- ─── 1. whatsapp_messages: invoice_id → document_id ──────────────────────
ALTER TABLE "whatsapp_messages"
  ADD COLUMN "document_id" uuid REFERENCES "documents"("id") ON DELETE CASCADE;
CREATE INDEX "whatsapp_messages_document_idx"
  ON "whatsapp_messages" USING btree ("document_id");

DROP INDEX IF EXISTS "whatsapp_messages_invoice_idx";
ALTER TABLE "whatsapp_messages" DROP COLUMN "invoice_id";

-- ─── 2. Drop legacy tables (CASCADE clears any lingering FKs) ────────────
DROP TABLE IF EXISTS "payments"           CASCADE;
DROP TABLE IF EXISTS "stock_movements"    CASCADE;
DROP TABLE IF EXISTS "invoice_line_items" CASCADE;
DROP TABLE IF EXISTS "invoices"           CASCADE;
DROP TABLE IF EXISTS "products"           CASCADE;
DROP TABLE IF EXISTS "customers"          CASCADE;

-- ─── 3. Rename item_stock_movements → stock_movements ────────────────────
ALTER TABLE "item_stock_movements" RENAME TO "stock_movements";

-- Indexes carry the old table name; rename for hygiene.
ALTER INDEX "item_stock_movements_item_idx"
  RENAME TO "stock_movements_item_idx";
ALTER INDEX "item_stock_movements_related_doc_idx"
  RENAME TO "stock_movements_related_doc_idx";
ALTER INDEX "item_stock_movements_business_date_idx"
  RENAME TO "stock_movements_business_date_idx";

-- FK constraint names too.
ALTER TABLE "stock_movements"
  RENAME CONSTRAINT "item_stock_movements_business_id_businesses_id_fk"
                 TO "stock_movements_business_id_businesses_id_fk";
ALTER TABLE "stock_movements"
  RENAME CONSTRAINT "item_stock_movements_item_id_items_id_fk"
                 TO "stock_movements_item_id_items_id_fk";
ALTER TABLE "stock_movements"
  RENAME CONSTRAINT "item_stock_movements_related_doc_id_documents_id_fk"
                 TO "stock_movements_related_doc_id_documents_id_fk";
ALTER TABLE "stock_movements"
  RENAME CONSTRAINT "item_stock_movements_related_party_id_parties_id_fk"
                 TO "stock_movements_related_party_id_parties_id_fk";
ALTER TABLE "stock_movements"
  RENAME CONSTRAINT "item_stock_movements_created_by_users_id_fk"
                 TO "stock_movements_created_by_users_id_fk";

-- ─── 4. Drop legacy enums (now unused) ───────────────────────────────────
DROP TYPE IF EXISTS "invoice_type";
DROP TYPE IF EXISTS "invoice_status";
DROP TYPE IF EXISTS "unit";
DROP TYPE IF EXISTS "stock_movement_type";

COMMIT;
