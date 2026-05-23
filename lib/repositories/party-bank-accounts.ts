/**
 * party_bank_accounts repository — owner's own + supplier banks.
 *
 * Multi-bank per party is supported (one row per `(party_id, bank_account
 * _number)`-ish — no DB-level UQ to keep room for duplicates with
 * different branches). The `is_default` flag is enforced server-side: at
 * most one default per party.
 *
 * Tenant isolation: every list / get path resolves the parent party first
 * (via `getPartyForUser[Tx]`) — banks inherit membership scoping from
 * the party they belong to.
 */
import "server-only";
import { and, asc, eq, isNull, ne } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewPartyBankAccount,
  type PartyBankAccount,
  partyBankAccounts,
} from "../db/schema";

export async function listPartyBankAccountsForParty(
  partyId: string,
): Promise<PartyBankAccount[]> {
  return db
    .select()
    .from(partyBankAccounts)
    .where(
      and(
        eq(partyBankAccounts.partyId, partyId),
        isNull(partyBankAccounts.deletedAt),
      ),
    )
    .orderBy(asc(partyBankAccounts.createdAt));
}

export async function getPartyBankAccountByIdTx(
  tx: Tx,
  accountId: string,
): Promise<PartyBankAccount | null> {
  const [row] = await tx
    .select()
    .from(partyBankAccounts)
    .where(
      and(
        eq(partyBankAccounts.id, accountId),
        isNull(partyBankAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertPartyBankAccountTx(
  tx: Tx,
  values: NewPartyBankAccount,
): Promise<PartyBankAccount> {
  const [row] = await tx
    .insert(partyBankAccounts)
    .values(values)
    .returning();
  if (!row) throw new Error("Insert party_bank_account returned no row");
  return row;
}

export interface PartyBankAccountPatch {
  bankAccountNumber?: string;
  ifsc?: string | null;
  accountHolderName?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  upiId?: string | null;
  isDefault?: boolean;
}

export async function updatePartyBankAccountTx(
  tx: Tx,
  accountId: string,
  patch: PartyBankAccountPatch,
): Promise<PartyBankAccount> {
  const [row] = await tx
    .update(partyBankAccounts)
    .set(patch)
    .where(eq(partyBankAccounts.id, accountId))
    .returning();
  if (!row) throw new Error("Update party_bank_account returned no row");
  return row;
}

export async function softDeletePartyBankAccountTx(
  tx: Tx,
  accountId: string,
): Promise<void> {
  await tx
    .update(partyBankAccounts)
    .set({ deletedAt: new Date() })
    .where(eq(partyBankAccounts.id, accountId));
}

/**
 * Unset `is_default=true` on every OTHER active bank for the party. Called
 * by the service when a row is set as default (or first row of a party
 * auto-defaults). Idempotent.
 */
export async function unsetOtherDefaultsForPartyTx(
  tx: Tx,
  partyId: string,
  exceptId: string,
): Promise<void> {
  await tx
    .update(partyBankAccounts)
    .set({ isDefault: false })
    .where(
      and(
        eq(partyBankAccounts.partyId, partyId),
        eq(partyBankAccounts.isDefault, true),
        ne(partyBankAccounts.id, exceptId),
        isNull(partyBankAccounts.deletedAt),
      ),
    );
}

/**
 * Count of active banks for a party — drives the "first bank auto-becomes
 * default" rule.
 */
export async function countPartyBankAccountsTx(
  tx: Tx,
  partyId: string,
): Promise<number> {
  const rows = await tx
    .select({ id: partyBankAccounts.id })
    .from(partyBankAccounts)
    .where(
      and(
        eq(partyBankAccounts.partyId, partyId),
        isNull(partyBankAccounts.deletedAt),
      ),
    );
  return rows.length;
}
