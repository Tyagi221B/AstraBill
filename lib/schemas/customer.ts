/**
 * Zod schemas — the API boundary for customer routes.
 *
 * Only `name` is required at create. The rest is filled in over time; an
 * unregistered walk-in might just have a name + phone, while a regular B2B
 * client carries GSTIN + address.
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

/** 15-character alphanumeric GSTIN (matches the business schema's rule). */
const gstin = z
  .string()
  .regex(/^[0-9A-Z]{15}$/, "GSTIN is 15 alphanumeric characters (uppercase)");

/** 2-digit GST state code — drives intra vs interstate when this customer
 *  becomes the place of supply on an invoice. */
const stateCode = z.string().regex(/^\d{2}$/, "GST state code is 2 digits");

/** 6-digit Indian PIN code. */
const pincode = z.string().regex(/^\d{6}$/, "Pincode is 6 digits");

export const createCustomerSchema = z.object({
  businessId: z.string().uuid(),
  name: trimmedNonEmpty(200, "Customer name"),
  // Phone is stored loosely here — the WhatsApp send path normalises to E.164.
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  gstin: gstin.nullable().optional(),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  stateCode: stateCode.nullable().optional(),
  pincode: pincode.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/** Update: every field optional, businessId stays locked (immutable tenant). */
export const updateCustomerSchema = createCustomerSchema
  .omit({ businessId: true })
  .partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
