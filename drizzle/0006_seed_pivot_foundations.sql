-- Pivot foundation seed (idempotent).
--
-- Three things:
--   1. System item_units (UQC list) — referenced by items.measuring_unit_code.
--   2. Per-existing-business backfill: default Cash money_account, "Cash Sale"
--      party, doc_type_defaults — so a business created BEFORE the pivot is
--      brought to the same baseline as one created after.
--   3. New businesses get this same baseline via lib/services/businesses.ts
--      (createBusiness). The service is the canonical seeder going forward;
--      this migration only catches existing rows.
--
-- All inserts are guarded by NOT EXISTS / ON CONFLICT so the migration is
-- safe to re-run if anyone ever does (it won't be — Drizzle records the hash
-- — but defence in depth).

-- ─── 1. system item_units ────────────────────────────────────────────────
INSERT INTO "item_units" ("code", "display_name", "is_system", "business_id") VALUES
  ('BAG', 'Bags', true, NULL),
  ('BAL', 'Bale', true, NULL),
  ('BDL', 'Bundles', true, NULL),
  ('BKL', 'Buckles', true, NULL),
  ('BOX', 'Box', true, NULL),
  ('BTL', 'Bottles', true, NULL),
  ('BUN', 'Bunches', true, NULL),
  ('CAN', 'Cans', true, NULL),
  ('CBM', 'Cubic Meters', true, NULL),
  ('CCM', 'Cubic Centimeters', true, NULL),
  ('CMS', 'Centimeters', true, NULL),
  ('CTN', 'Cartons', true, NULL),
  ('DOZ', 'Dozens', true, NULL),
  ('DRM', 'Drums', true, NULL),
  ('GMS', 'Grams', true, NULL),
  ('GRS', 'Gross', true, NULL),
  ('HKS', 'Hanks', true, NULL),
  ('KGS', 'Kilograms', true, NULL),
  ('KLR', 'Kilolitre', true, NULL),
  ('KME', 'Kilometre', true, NULL),
  ('LTR', 'Litres', true, NULL),
  ('MLT', 'Millilitre', true, NULL),
  ('MTR', 'Meters', true, NULL),
  ('MTS', 'Metric Ton', true, NULL),
  ('NOS', 'Numbers', true, NULL),
  ('OTH', 'Others', true, NULL),
  ('PAC', 'Packs', true, NULL),
  ('PCS', 'Pieces', true, NULL),
  ('PRS', 'Pairs', true, NULL),
  ('QTL', 'Quintal', true, NULL),
  ('ROL', 'Rolls', true, NULL),
  ('SET', 'Sets', true, NULL),
  ('SQF', 'Square Feet', true, NULL),
  ('SQM', 'Square Meters', true, NULL),
  ('SQY', 'Square Yards', true, NULL),
  ('TBS', 'Tablets', true, NULL),
  ('THD', 'Thousands', true, NULL),
  ('TON', 'Tonnes', true, NULL),
  ('TUB', 'Tubes', true, NULL),
  ('UNT', 'Units', true, NULL),
  ('YDS', 'Yards', true, NULL)
ON CONFLICT ("code") DO NOTHING;

-- ─── 2a. Default Cash money_account for each existing business ───────────
INSERT INTO "money_accounts" ("business_id", "type", "name", "is_default")
SELECT b."id", 'cash', 'Cash in hand', true
FROM "businesses" b
WHERE NOT EXISTS (
  SELECT 1 FROM "money_accounts" ma
  WHERE ma."business_id" = b."id"
    AND ma."type" = 'cash'
    AND ma."deleted_at" IS NULL
);

-- ─── 2b. "Cash Sale" party for each existing business ────────────────────
INSERT INTO "parties" ("business_id", "type", "name", "credit_period_days", "credit_limit")
SELECT b."id", 'customer', 'Cash Sale', 0, '0'
FROM "businesses" b
WHERE NOT EXISTS (
  SELECT 1 FROM "parties" p
  WHERE p."business_id" = b."id"
    AND p."name" = 'Cash Sale'
    AND p."deleted_at" IS NULL
);

-- ─── 2c. Seed doc_type_defaults for businesses that don't have any yet ───
-- The `[CITY]` placeholder is substituted at render time by the service
-- layer (lib/constants/doc-type-defaults.ts::applyCityPlaceholder).
UPDATE "businesses"
SET "doc_type_defaults" = jsonb_build_object(
  'sales_invoice', jsonb_build_object(
    'termsConditions', '1. Goods once sold will not be taken back or exchanged.' || chr(10) ||
                       '2. All disputes are subject to [CITY] jurisdiction only.'
  ),
  'estimate', jsonb_build_object(
    'termsConditions', 'This estimate is valid for 30 days from the date of issue. Prices are subject to change after this period.'
  ),
  'delivery_challan', jsonb_build_object('termsConditions', ''),
  'credit_note', jsonb_build_object('termsConditions', ''),
  'purchase_invoice', jsonb_build_object('termsConditions', ''),
  'debit_note', jsonb_build_object('termsConditions', ''),
  'quotation', jsonb_build_object(
    'termsConditions', 'This quotation is valid for 30 days from the date of issue. Prices are subject to change after this period.'
  ),
  'proforma_invoice', jsonb_build_object('termsConditions', '')
)
WHERE "doc_type_defaults" = '{}'::jsonb;
