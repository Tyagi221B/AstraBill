/**
 * Zod schemas — the API boundary for money account routes.
 *
 * A money account is either type `cash` (no bank fields) or `bank` (bank
 * fields populated). The service enforces the field-set-by-type invariant.
 *
 * Opening balance: set at create, realised as a single ledger_entries row
 * with voucher_type='opening_balance'. Editing the column later does NOT
 * retroactively shift the running balance — use Add/Reduce Money instead.
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

const money = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Amount must be a number with up to 2 decimals");

const positiveMoney = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a non-negative number")
  .refine((s) => Number(s) > 0, "Amount must be greater than zero");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const moneyAccountTypeSchema = z.enum(["cash", "bank"]);

/** Bank details — required when type='bank', forbidden when type='cash'. */
const bankFields = {
  bankAccountNumber: z.string().trim().max(40).nullable().optional(),
  ifsc: z.string().trim().max(20).nullable().optional(),
  accountHolderName: z.string().trim().max(200).nullable().optional(),
  bankName: z.string().trim().max(120).nullable().optional(),
  branchName: z.string().trim().max(120).nullable().optional(),
  upiId: z.string().trim().max(120).nullable().optional(),
};

export const createMoneyAccountSchema = z
  .object({
    businessId: z.string().uuid(),
    type: moneyAccountTypeSchema,
    name: trimmedNonEmpty(120, "Account name"),
    /** Realised as an opening_balance ledger entry. May be 0 / negative not allowed. */
    openingBalance: money.optional(),
    openingBalanceAsOfDate: isoDate.optional(),
    isDefault: z.boolean().optional(),
    ...bankFields,
  })
  .refine(
    (v) =>
      v.type === "cash" ? !v.bankAccountNumber && !v.ifsc : true,
    {
      message: "Cash accounts can't carry bank details",
      path: ["bankAccountNumber"],
    },
  )
  .refine(
    (v) =>
      v.type === "bank" ? Boolean(v.bankAccountNumber && v.ifsc) : true,
    {
      message: "Bank accounts need account number + IFSC",
      path: ["bankAccountNumber"],
    },
  );
export type CreateMoneyAccountInput = z.infer<typeof createMoneyAccountSchema>;

export const updateMoneyAccountSchema = z.object({
  name: trimmedNonEmpty(120, "Account name").optional(),
  isDefault: z.boolean().optional(),
  ...bankFields,
});
export type UpdateMoneyAccountInput = z.infer<typeof updateMoneyAccountSchema>;

export const listMoneyAccountsQuerySchema = z.object({
  businessId: z.string().uuid(),
});
export type ListMoneyAccountsQuery = z.infer<
  typeof listMoneyAccountsQuerySchema
>;

export const adjustMoneyAccountSchema = z.object({
  direction: z.enum(["add", "reduce"]),
  amount: positiveMoney,
  entryDate: isoDate.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type AdjustMoneyAccountInput = z.infer<typeof adjustMoneyAccountSchema>;

export const transferMoneyAccountSchema = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amount: positiveMoney,
    entryDate: isoDate.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    message: "Source and destination must be different accounts",
    path: ["toAccountId"],
  });
export type TransferMoneyAccountInput = z.infer<
  typeof transferMoneyAccountSchema
>;
