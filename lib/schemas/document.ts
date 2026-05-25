/**
 * Zod schemas — the API boundary for document routes.
 *
 * One schema covers all 8 doc types via the `docType` discriminator. The
 * service layer differentiates downstream behaviour (ledger posting, stock
 * movements) via a per-doc-type policy table.
 *
 * Numbers (money / qty / rates) come over the wire as strings to preserve
 * decimal precision end-to-end.
 */
import { z } from "zod";

const money = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Amount must be a number with up to 2 decimals");

const positiveMoney = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be non-negative")
  .refine((s) => Number(s) > 0, "Amount must be > 0");

const qty = z
  .string()
  .regex(/^-?\d+(\.\d{1,3})?$/, "Quantity must be a number with up to 3 decimals");

const positiveQty = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Quantity must be non-negative")
  .refine((s) => Number(s) > 0, "Quantity must be > 0");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const gstRate = z
  .string()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, "GST rate must be non-negative");

export const docTypeSchema = z.enum([
  "sales_invoice",
  "estimate",
  "delivery_challan",
  "credit_note",
  "purchase_invoice",
  "debit_note",
  "quotation",
  "proforma_invoice",
]);

export const lineItemInputSchema = z.object({
  /** Optional FK to items; null for free-text line. */
  itemId: z.string().uuid().nullable().optional(),
  /** Snapshot on save — required even when itemId is set so the doc is self-describing. */
  itemNameSnapshot: z.string().trim().min(1).max(200),
  hsnSacCodeSnapshot: z.string().trim().max(20).nullable().optional(),
  unitCodeSnapshot: z.string().trim().max(20).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  quantity: positiveQty,
  secondaryQuantity: qty.nullable().optional(),
  secondaryUnitCode: z.string().trim().max(20).nullable().optional(),
  pricePerUnit: money,
  priceIncludesTax: z.boolean().optional(),
  discountPercent: gstRate.nullable().optional(),
  discountAmount: money.optional(),
  /** Null = exempted; "0" = nil-rated; > 0 = taxable. */
  gstRate: gstRate.nullable().optional(),
});
export type LineItemInputDto = z.infer<typeof lineItemInputSchema>;

export const additionalChargeInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  amount: money,
  taxable: z.boolean(),
  gstRate: gstRate.nullable().optional(),
});
export type AdditionalChargeInputDto = z.infer<
  typeof additionalChargeInputSchema
>;

/**
 * Inline payment captured at invoice create. When present, the server
 * finalises the doc and records a payment in one atomic transaction.
 * Only honoured on POST (create), ignored on PATCH (edit).
 */
export const firstPaymentInputSchema = z.object({
  amount: positiveMoney,
  paymentMode: z.enum([
    "upi",
    "cash",
    "bank_transfer",
    "card",
    "cheque",
    "other",
  ]),
  moneyAccountId: z.string().uuid(),
});
export type FirstPaymentInputDto = z.infer<typeof firstPaymentInputSchema>;

export const createDocumentSchema = z.object({
  businessId: z.string().uuid(),
  docType: docTypeSchema,
  docDate: isoDate,
  partyId: z.string().uuid(),
  shipToAddressId: z.string().uuid().nullable().optional(),
  sourceDocId: z.string().uuid().nullable().optional(),
  originalDocNumber: z.string().trim().max(80).nullable().optional(),
  originalDocDate: isoDate.nullable().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  placeOfSupplyStateCode: z
    .string()
    .regex(/^\d{2}$/, "State code is 2 digits")
    .nullable()
    .optional(),
  signatureUrl: z.string().url().nullable().optional(),
  termsConditions: z.string().trim().max(5000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  autoRoundOffEnabled: z.boolean().optional(),
  billLevelDiscount: money.optional(),
  transportMode: z.string().trim().max(80).nullable().optional(),
  vehicleNumber: z.string().trim().max(40).nullable().optional(),
  ewayBillNumber: z.string().trim().max(40).nullable().optional(),
  lines: z.array(lineItemInputSchema).min(1, "At least one line item is required"),
  additionalCharges: z.array(additionalChargeInputSchema).optional(),
  /** If present, the server will finalise the doc and record a
   *  payment_in (sales side) / payment_out (purchase side) in the same
   *  transaction. Amount must be <= grand total. */
  firstPayment: firstPaymentInputSchema.optional(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

/** Update: same shape, businessId / docType locked (immutable).
 *  firstPayment is omitted — it is only meaningful at create time. A PATCH
 *  carrying it would have been silently dropped; reject it at the boundary
 *  so the API surface matches behaviour. To record a payment on an existing
 *  doc, use POST /api/payment-entries. */
export const updateDocumentSchema = createDocumentSchema
  .omit({ businessId: true, docType: true, firstPayment: true })
  .partial({ lines: true, additionalCharges: true });
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const listDocumentsQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  docType: docTypeSchema.optional(),
  status: z
    .enum(["draft", "unpaid", "partial_paid", "paid", "cancelled"])
    .optional(),
  partyId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const cancelDocumentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelDocumentInput = z.infer<typeof cancelDocumentSchema>;

// Re-export the positive-money type used by allocations elsewhere.
export { positiveMoney };
