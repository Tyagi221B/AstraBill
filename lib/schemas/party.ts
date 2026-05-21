/**
 * Zod schemas — the API boundary for party routes.
 *
 * Mirrors the old customer schema's looseness on optional fields: only
 * `name` + `type` are required at create. The rest is filled in over time;
 * a walk-in might just have a name + mobile, while a regular B2B party
 * carries GSTIN + PAN + addresses.
 *
 * No uniqueness check on mobile / GSTIN here — those are soft warnings
 * surfaced separately by `GET /api/parties/check-duplicates` (lands in a
 * later step).
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

/** 15-character alphanumeric GSTIN. */
const gstin = z
  .string()
  .regex(/^[0-9A-Z]{15}$/, "GSTIN is 15 alphanumeric characters (uppercase)");

/** 10-character PAN: 5 letters + 4 digits + 1 letter. */
const pan = z
  .string()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN is 5 letters + 4 digits + 1 letter");

/** Money string — at the API boundary we accept plain decimal text. */
const money = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Amount must be a number with up to 2 decimals");

/** ISO date string (YYYY-MM-DD), the format Postgres `date` columns accept. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const partyTypeSchema = z.enum(["customer", "supplier"]);

export const createPartySchema = z.object({
  businessId: z.string().uuid(),
  type: partyTypeSchema,
  name: trimmedNonEmpty(200, "Party name"),
  mobileNumber: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  gstin: gstin.nullable().optional(),
  panNumber: pan.nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  creditPeriodDays: z.coerce.number().int().min(0).max(365).optional(),
  creditLimit: money.optional(),
  contactPersonName: z.string().trim().max(200).nullable().optional(),
  contactPersonDob: isoDate.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type CreatePartyInput = z.infer<typeof createPartySchema>;

/** Update: every field optional; businessId stays locked (immutable tenant). */
export const updatePartySchema = createPartySchema
  .omit({ businessId: true })
  .partial();
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;

export const listPartiesQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  type: partyTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type ListPartiesQuery = z.infer<typeof listPartiesQuerySchema>;
