/**
 * Zod schemas for the multi-shipping-address routes on a party.
 *
 * Every shipping row carries a `label` (e.g. "Warehouse", "Branch office")
 * — required at this surface even though the column is nullable in the DB
 * (the column is shared with billing rows, which don't have meaningful
 * labels). Address fields stay nullable to match the V1 "partial address
 * is ok" pattern.
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

const optionalAddressField = (max: number) =>
  z.string().trim().max(max).nullable().optional();

const stateCode = z
  .string()
  .regex(/^\d{2}$/, "State code must be 2 digits")
  .nullable()
  .optional();

const pincode = z
  .string()
  .regex(/^\d{6}$/, "Pincode must be 6 digits")
  .nullable()
  .optional();

export const createPartyShippingAddressSchema = z.object({
  label: trimmedNonEmpty(80, "Label"),
  streetAddress: optionalAddressField(500),
  city: optionalAddressField(120),
  state: optionalAddressField(120),
  stateCode,
  pincode,
  isDefault: z.boolean().optional(),
});
export type CreatePartyShippingAddressInput = z.infer<
  typeof createPartyShippingAddressSchema
>;

export const updatePartyShippingAddressSchema =
  createPartyShippingAddressSchema.partial();
export type UpdatePartyShippingAddressInput = z.infer<
  typeof updatePartyShippingAddressSchema
>;
