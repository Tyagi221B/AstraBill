/**
 * Zod schemas for payment_entry routes.
 *
 * Payment entries always include at least one allocation against a finalised
 * document — sum of allocations must equal `amount` (settlement discount,
 * if any, is the third party-side leg, not part of allocations).
 */
import { z } from "zod";

const positiveMoney = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be non-negative")
  .refine((s) => Number(s) > 0, "Amount must be > 0");

const nonNegativeMoney = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be non-negative");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const paymentMethodSchema = z.enum([
  "upi",
  "cash",
  "bank_transfer",
  "card",
  "cheque",
  "other",
]);

export const allocationInputSchema = z.object({
  documentId: z.string().uuid(),
  allocatedAmount: positiveMoney,
});
export type AllocationInputDto = z.infer<typeof allocationInputSchema>;

export const createPaymentEntrySchema = z.object({
  businessId: z.string().uuid(),
  entryType: z.enum(["payment_in", "payment_out"]),
  entryDate: isoDate,
  partyId: z.string().uuid(),
  moneyAccountId: z.string().uuid(),
  amount: positiveMoney,
  discountAmount: nonNegativeMoney.optional(), // settlement write-off
  paymentMode: paymentMethodSchema,
  reference: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  /** Required — payments must settle at least one finalised doc. */
  allocations: z
    .array(allocationInputSchema)
    .min(1, "At least one document allocation is required"),
});
export type CreatePaymentEntryInput = z.infer<typeof createPaymentEntrySchema>;

export const listPaymentEntriesQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  partyId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type ListPaymentEntriesQuery = z.infer<
  typeof listPaymentEntriesQuerySchema
>;

export const cancelPaymentEntrySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelPaymentEntryInput = z.infer<
  typeof cancelPaymentEntrySchema
>;
