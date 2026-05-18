/**
 * Zod schemas — the API boundary for invoice routes.
 *
 * Schemas validate at the *route* edge only (per the architecture decision).
 * Services and repositories trust their inputs and work with the inferred
 * types.
 */
import { z } from "zod";

import {
  invoiceType as invoiceTypeEnum,
  unit as unitEnum,
} from "../db/schema";

// ---- Reusable atoms -----------------------------------------------------

/** Money: "1234.56" (NUMERIC(12,2) on the wire). */
const money = z
  .string()
  .regex(/^-?\d{1,10}(\.\d{1,2})?$/, "Invalid money amount");

/** Quantity: "1.500" — up to 3 decimal places for fractional units. */
const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "Invalid quantity")
  .refine((v) => Number(v) > 0, "Quantity must be greater than zero");

/** GST rate as a percentage: "18.00". */
const gstRate = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Invalid GST rate");

/** 2-digit GST state code, e.g. "07" (Delhi), "29" (Karnataka). */
const stateCode = z.string().regex(/^\d{2}$/, "GST state code is 2 digits");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

// ---- Line item ----------------------------------------------------------

const lineItemSchema = z.object({
  /** Null for custom line items (cutting charges, labour, transport). */
  productId: z.string().uuid().nullable().optional(),
  /** Required even when productId is set — captures the product-name snapshot. */
  description: z.string().min(1).max(500),
  hsnCode: z.string().max(20).nullable().optional(),
  quantity,
  unit: z.enum(unitEnum.enumValues),
  unitPrice: money,
  discountAmount: money.default("0"),
  gstRate,
});

// ---- Create invoice -----------------------------------------------------

/** Query string for GET /api/invoices. */
export const listInvoicesQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  status: z
    .enum(["draft", "sent", "seen", "partially_paid", "paid", "overdue"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const createInvoiceSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  type: z.enum(invoiceTypeEnum.enumValues).default("tax_invoice"),
  /** Required for credit/debit notes — the invoice they adjust. */
  originalInvoiceId: z.string().uuid().nullable().optional(),
  placeOfSupplyStateCode: stateCode.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  issueDate: isoDate.optional(),
  dueDate: isoDate.nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateInvoiceLineItemInput = z.infer<typeof lineItemSchema>;

// ---- Update invoice (drafts only) ---------------------------------------

/**
 * What can change on an edit: place of supply, notes, dates, full line-item
 * replacement. What CANNOT change: businessId, type, number, status,
 * originalInvoiceId, createdBy — those are locked once the row exists.
 * Changing type would re-shuffle the per-type numbering series; changing
 * business would break tenant isolation. Both are deliberate refusals.
 */
export const updateInvoiceSchema = z.object({
  placeOfSupplyStateCode: stateCode.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  issueDate: isoDate.optional(),
  dueDate: isoDate.nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
