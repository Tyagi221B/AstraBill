/**
 * Zod schemas for stock adjustment routes.
 *
 * Stock adjustments are a manual movement (`item_stock_movements.txn_type =
 * 'manual_adjustment'`). The form posts `direction` + a positive `qty`; the
 * service signs the qty (+ for add, − for reduce) before insert.
 *
 * NOTE: stock from sales / purchases / returns is written automatically by
 * the document finalise pipeline, not through this endpoint.
 */
import { z } from "zod";

const positiveQty = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Quantity must be a non-negative number")
  .refine((s) => Number(s) > 0, "Quantity must be greater than zero");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const adjustStockSchema = z.object({
  direction: z.enum(["add", "reduce"]),
  qty: positiveQty,
  txnDate: isoDate.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
