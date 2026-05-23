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

import { partyCustomFieldValueSchema } from "./party-custom-field";

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

/**
 * Address payload — every field nullable so the UI can capture a partial
 * address (V1 shopkeepers often type only the line + state). State / state
 * code together drive GST class (intra vs inter) on documents; both are
 * persisted so the dropdown's `code` doesn't need re-lookup at read time.
 * A 6-digit pincode is the only field with format validation, and only
 * when non-empty.
 */
export const addressSchema = z.object({
  streetAddress: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  stateCode: z
    .string()
    .regex(/^\d{2}$/, "State code must be 2 digits")
    .nullable()
    .optional(),
  pincode: z
    .string()
    .regex(/^\d{6}$/, "Pincode must be 6 digits")
    .nullable()
    .optional(),
});
export type AddressInputZ = z.infer<typeof addressSchema>;

/**
 * Shipping toggle on PartyForm. When `sameAsBilling = true` the client
 * sends no shippingAddress block at all (or null) and the service soft-
 * deletes any existing default shipping row. When false, the
 * shippingAddress block is required (even if every field is empty).
 */
export const shippingPolicySchema = z.discriminatedUnion("sameAsBilling", [
  z.object({ sameAsBilling: z.literal(true) }),
  z.object({
    sameAsBilling: z.literal(false),
    shippingAddress: addressSchema,
  }),
]);
export type ShippingPolicy = z.infer<typeof shippingPolicySchema>;

export const partyTypeSchema = z.enum(["customer", "supplier"]);

/**
 * Opening balance — captured on party form. Posts a single `opening_balance`
 * row to `ledger_entries`:
 *   - direction = "to_collect" → debit leg (party owes us)
 *   - direction = "to_pay"     → credit leg (we owe party)
 *
 * Once the party has any non-opening-balance ledger activity (an invoice or
 * a payment), this becomes immutable — the service throws ConflictError on
 * any attempted change. The UI surfaces it as a locked field with a reason.
 *
 * `amount` is a string the whole way through (memory: money stays string).
 * "0" / "" are treated as "no opening balance" — the service skips the post.
 */
export const openingBalanceDirectionSchema = z.enum(["to_collect", "to_pay"]);
export type OpeningBalanceDirection = z.infer<
  typeof openingBalanceDirectionSchema
>;

export const openingBalanceSchema = z.object({
  amount: money,
  direction: openingBalanceDirectionSchema,
  /** Defaults to today (server-side) when omitted. */
  asOfDate: isoDate.optional(),
});
export type OpeningBalanceInputZ = z.infer<typeof openingBalanceSchema>;

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
  /** Billing address — optional; when omitted, no billing row is created. */
  billingAddress: addressSchema.nullable().optional(),
  /** Shipping policy — defaults to `sameAsBilling: true` when omitted. */
  shipping: shippingPolicySchema.optional(),
  /** Opening balance — optional; "0" amount = no posting. */
  openingBalance: openingBalanceSchema.nullable().optional(),
  /** Workspace custom-field values keyed by definitionId. Stray IDs are
   *  filtered server-side (they're dropped silently). */
  customFields: z.array(partyCustomFieldValueSchema).optional(),
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
