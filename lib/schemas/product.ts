/**
 * Zod schemas — the API boundary for product routes.
 *
 * `purchasePrice` is optional (a shop may not track cost). When present, it
 * survives the schema as-is, but the service redacts it on the way out for
 * roles that lack `report:view_profit` (see lib/rbac → redactForRole).
 */
import { z } from "zod";

import { unit as unitEnum } from "../db/schema";

const money = z
  .string()
  .regex(/^-?\d{1,10}(\.\d{1,2})?$/, "Invalid money amount");

const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "Invalid quantity")
  .refine((v) => Number(v) >= 0, "Quantity cannot be negative");

const gstRate = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Invalid GST rate");

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

export const createProductSchema = z.object({
  businessId: z.string().uuid(),
  name: trimmedNonEmpty(200, "Product name"),
  hsnCode: z.string().trim().max(20).nullable().optional(),
  unit: z.enum(unitEnum.enumValues).default("pcs"),
  gstRate: gstRate.default("0"),
  purchasePrice: money.nullable().optional(),
  sellingPrice: money,
  stock: quantity.default("0"),
  lowStockThreshold: quantity.nullable().optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ businessId: true })
  .partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
