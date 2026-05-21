/**
 * money_accounts service — the cash drawer + bank accounts a business
 * operates. Every payment_entry references exactly one money_account.
 *
 * For Step 1 of PR2 this is the read surface only — list helpers for the
 * UI + the seed helper used by createBusiness. Create/update flows for
 * user-facing money_account management ship with the Cash & Bank UI step.
 */
import "server-only";

import type { Tx } from "../db";
import type { MoneyAccount } from "../db/schema";
import {
  businessHasMoneyAccountOfTypeTx,
  insertMoneyAccountTx,
  listMoneyAccountsForUser,
} from "../repositories/money-accounts";

/**
 * Idempotent — creates the default `Cash in hand` account only if the
 * business doesn't already have any cash account. Called from createBusiness
 * inside its own transaction.
 */
export async function ensureDefaultCashAccountTx(
  tx: Tx,
  businessId: string,
): Promise<MoneyAccount | null> {
  const hasCash = await businessHasMoneyAccountOfTypeTx(tx, businessId, "cash");
  if (hasCash) return null;
  return insertMoneyAccountTx(tx, {
    businessId,
    type: "cash",
    name: "Cash in hand",
    isDefault: true,
  });
}

export { listMoneyAccountsForUser };
