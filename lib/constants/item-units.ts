/**
 * UQC (Unit Quantity Code) — the GST-portal-recognised unit list used on
 * `item_units` rows where `is_system = true, business_id IS NULL`. Seeded
 * into the DB by migration 0006; this file is the canonical TypeScript copy
 * for any UI dropdown.
 *
 * `code` is the FK referenced by `items.measuring_unit_code` and snapshotted
 * onto `document_line_items.unit_code_snapshot`. Keep these stable — they
 * appear on issued invoices.
 *
 * Customers may add their own (business-scoped, is_system=false) at V1.5.
 */
export const SYSTEM_ITEM_UNITS: ReadonlyArray<{
  code: string;
  displayName: string;
}> = [
  { code: "BAG", displayName: "Bags" },
  { code: "BAL", displayName: "Bale" },
  { code: "BDL", displayName: "Bundles" },
  { code: "BKL", displayName: "Buckles" },
  { code: "BOX", displayName: "Box" },
  { code: "BTL", displayName: "Bottles" },
  { code: "BUN", displayName: "Bunches" },
  { code: "CAN", displayName: "Cans" },
  { code: "CBM", displayName: "Cubic Meters" },
  { code: "CCM", displayName: "Cubic Centimeters" },
  { code: "CMS", displayName: "Centimeters" },
  { code: "CTN", displayName: "Cartons" },
  { code: "DOZ", displayName: "Dozens" },
  { code: "DRM", displayName: "Drums" },
  { code: "GMS", displayName: "Grams" },
  { code: "GRS", displayName: "Gross" },
  { code: "HKS", displayName: "Hanks" },
  { code: "KGS", displayName: "Kilograms" },
  { code: "KLR", displayName: "Kilolitre" },
  { code: "KME", displayName: "Kilometre" },
  { code: "LTR", displayName: "Litres" },
  { code: "MLT", displayName: "Millilitre" },
  { code: "MTR", displayName: "Meters" },
  { code: "MTS", displayName: "Metric Ton" },
  { code: "NOS", displayName: "Numbers" },
  { code: "OTH", displayName: "Others" },
  { code: "PAC", displayName: "Packs" },
  { code: "PCS", displayName: "Pieces" },
  { code: "PRS", displayName: "Pairs" },
  { code: "QTL", displayName: "Quintal" },
  { code: "ROL", displayName: "Rolls" },
  { code: "SET", displayName: "Sets" },
  { code: "SQF", displayName: "Square Feet" },
  { code: "SQM", displayName: "Square Meters" },
  { code: "SQY", displayName: "Square Yards" },
  { code: "TBS", displayName: "Tablets" },
  { code: "THD", displayName: "Thousands" },
  { code: "TON", displayName: "Tonnes" },
  { code: "TUB", displayName: "Tubes" },
  { code: "UNT", displayName: "Units" },
  { code: "YDS", displayName: "Yards" },
];

/** Default unit a newly-created product picks — most-used in trading shops. */
export const DEFAULT_ITEM_UNIT_CODE = "PCS";
