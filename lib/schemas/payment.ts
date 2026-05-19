/**
 * Zod schema — the API boundary for payment routes.
 *
 * Validates at the route edge only (per the architecture decision). The
 * service + repository trust their inputs and work with the inferred types.
 */
import { z } from "zod";

import { paymentMethod as paymentMethodEnum } from "../db/schema";

/** Money: "1234.56" — positive, NUMERIC(12,2) on the wire. A payment of
 *  zero or a negative amount is meaningless; reject both. */
const positiveMoney = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Invalid amount")
  .refine((v) => Number(v) > 0, "Amount must be greater than zero");

/** Calendar date YYYY-MM-DD — the day the money was received. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/** POST /api/invoices/[id]/payments — record one payment against an invoice. */
export const recordPaymentSchema = z.object({
  amount: positiveMoney,
  method: z.enum(paymentMethodEnum.enumValues),
  /** Defaults to today in the service when omitted. */
  paidAt: isoDate.optional(),
  /** UPI txn ref / cheque number / free note. */
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
