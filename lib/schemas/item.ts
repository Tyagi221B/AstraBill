/**
 * Zod schemas — the API boundary for item routes.
 *
 * `name` + `type` are the only requirements; everything else is optional so
 * the form can be saved iteratively. GST rate semantics (locked by
 * decision/full-ledger-pivot): `null` = exempted, `"0"` = nil-rated, `>0` =
 * taxable. The chips UI maps null → "Exempted", 0 → "0%".
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

const money = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Amount must be a number with up to 2 decimals");

const qty = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, "Quantity must be a number with up to 3 decimals");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const gstRate = z
  .string()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, "GST rate must be a non-negative number");

export const itemTypeSchema = z.enum(["product", "service"]);

export const createItemSchema = z.object({
  businessId: z.string().uuid(),
  type: itemTypeSchema,
  name: trimmedNonEmpty(200, "Item name"),
  categoryId: z.string().uuid().nullable().optional(),
  code: z.string().trim().max(100).nullable().optional(),
  hsnSacCode: z.string().trim().max(20).nullable().optional(),
  /** FK code into `item_units`. Required for products; optional for services. */
  measuringUnitCode: z.string().trim().max(20).nullable().optional(),
  alternativeUnitCode: z.string().trim().max(20).nullable().optional(),
  salesPrice: money.nullable().optional(),
  salesPriceIncludesTax: z.boolean().optional(),
  purchasePrice: money.nullable().optional(),
  purchasePriceIncludesTax: z.boolean().optional(),
  /** null = exempted; "0" = nil-rated; > 0 = taxable. */
  gstRate: gstRate.nullable().optional(),
  discountOnSalesPricePercent: gstRate.nullable().optional(),
  openingStock: qty.nullable().optional(),
  openingStockAsOfDate: isoDate.nullable().optional(),
  enableLowStockWarning: z.boolean().optional(),
  lowStockThreshold: qty.nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema
  .omit({ businessId: true })
  .partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const listItemsQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  type: itemTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
