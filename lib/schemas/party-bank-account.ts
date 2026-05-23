/**
 * Zod schemas for party bank account routes.
 *
 * `party_bank_accounts` supports multiple banks per party (deviation D1 in
 * the V1 schema — most owners only have 1 bank per supplier, but a
 * sub-distributor may have UPI + a couple of NEFT-ready accounts).
 *
 * Validation rules:
 *   - account number: 6–20 digits/letters (Indian bank lengths span 9–18,
 *     padded a bit for foreign-account oddities)
 *   - IFSC: standard format `^[A-Z]{4}0[A-Z0-9]{6}$`
 *   - UPI ID: lazy `<id>@<handle>` regex; many wallets use exotic chars,
 *     so we don't enforce strictly
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

const accountNumber = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9]{6,20}$/,
    "Account number must be 6–20 alphanumeric characters",
  );

const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z]{4}0[A-Z0-9]{6}$/,
    "IFSC must be 11 characters: 4 letters + '0' + 6 alphanumerics",
  );

const upiId = z
  .string()
  .trim()
  .regex(/^[^\s@]+@[^\s@]+$/, "UPI ID looks like name@bank");

export const createPartyBankAccountSchema = z.object({
  bankAccountNumber: accountNumber,
  ifsc: ifsc.nullable().optional(),
  accountHolderName: trimmedNonEmpty(200, "Account holder name")
    .nullable()
    .optional(),
  bankName: z.string().trim().max(200).nullable().optional(),
  branchName: z.string().trim().max(200).nullable().optional(),
  upiId: upiId.nullable().optional(),
  isDefault: z.boolean().optional(),
});
export type CreatePartyBankAccountInput = z.infer<
  typeof createPartyBankAccountSchema
>;

/** Every field optional (PATCH semantics); same validation when present. */
export const updatePartyBankAccountSchema =
  createPartyBankAccountSchema.partial();
export type UpdatePartyBankAccountInput = z.infer<
  typeof updatePartyBankAccountSchema
>;
