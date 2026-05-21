/**
 * parties service — replaces the customers service going forward.
 *
 * Step 1 of PR2 ships the read surface + the seed helper used by
 * createBusiness ("Cash Sale" walk-in customer). Full CRUD (with audit log,
 * RBAC, soft warnings on mobile / GSTIN duplicates) ships with the Parties
 * UI step.
 */
import "server-only";

import type { Tx } from "../db";
import type { Party } from "../db/schema";
import {
  businessHasPartyNamedTx,
  insertPartyTx,
  listPartiesForUser,
} from "../repositories/parties";

/** The walk-in customer that holds cash sales. Created once per business. */
export const CASH_SALE_PARTY_NAME = "Cash Sale";

/**
 * Idempotent — creates the "Cash Sale" walk-in party only if a party with
 * that exact name doesn't already exist for the business. Called from
 * createBusiness inside its own transaction.
 */
export async function ensureCashSalePartyTx(
  tx: Tx,
  businessId: string,
): Promise<Party | null> {
  const exists = await businessHasPartyNamedTx(
    tx,
    businessId,
    CASH_SALE_PARTY_NAME,
  );
  if (exists) return null;
  return insertPartyTx(tx, {
    businessId,
    type: "customer",
    name: CASH_SALE_PARTY_NAME,
    creditPeriodDays: 0,
    creditLimit: "0",
  });
}

export { listPartiesForUser };
