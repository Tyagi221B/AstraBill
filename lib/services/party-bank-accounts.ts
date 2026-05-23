/**
 * party_bank_accounts service — RBAC + audit, scoped through the parent
 * party.
 *
 * Permission model: bank accounts are subordinate data on a party, so we
 * gate on `party:edit` rather than introducing a separate permission.
 * Tenant scoping comes from resolving the parent party with the existing
 * `getPartyForUserTx` helper.
 *
 * Default-flag invariant: at most one default bank per party. The first
 * bank a party gets is auto-default. Set-default elsewhere flips others
 * off in the same transaction. (UI also surfaces the same convention.)
 */
import "server-only";

import { db, type Tx } from "../db";
import type { PartyBankAccount } from "../db/schema";
import { NotFoundError } from "../errors";
import { writeAuditEntry } from "../audit";
import { requirePermission } from "../rbac";
import { getPartyForUserTx } from "../repositories/parties";
import {
  countPartyBankAccountsTx,
  getPartyBankAccountByIdTx,
  insertPartyBankAccountTx,
  listPartyBankAccountsForParty,
  softDeletePartyBankAccountTx,
  unsetOtherDefaultsForPartyTx,
  updatePartyBankAccountTx,
} from "../repositories/party-bank-accounts";
import type {
  CreatePartyBankAccountInput,
  UpdatePartyBankAccountInput,
} from "../schemas/party-bank-account";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

async function loadAndAuthorizeParty(
  tx: Tx,
  actorUserId: string,
  partyId: string,
): Promise<{ businessId: string }> {
  const party = await getPartyForUserTx(tx, actorUserId, partyId);
  if (!party) throw new NotFoundError("Party not found");
  await requirePermission(actorUserId, party.businessId, "party:edit");
  return { businessId: party.businessId };
}

export async function createPartyBankAccount(
  partyId: string,
  input: CreatePartyBankAccountInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PartyBankAccount> {
  return db.transaction(async (tx) => {
    const { businessId } = await loadAndAuthorizeParty(tx, actorUserId, partyId);

    const existingCount = await countPartyBankAccountsTx(tx, partyId);
    const isDefault = input.isDefault ?? existingCount === 0;

    const row = await insertPartyBankAccountTx(tx, {
      businessId,
      partyId,
      bankAccountNumber: input.bankAccountNumber,
      ifsc: input.ifsc ?? null,
      accountHolderName: input.accountHolderName ?? null,
      bankName: input.bankName ?? null,
      branchName: input.branchName ?? null,
      upiId: input.upiId ?? null,
      isDefault,
    });

    if (isDefault) {
      await unsetOtherDefaultsForPartyTx(tx, partyId, row.id);
    }

    await writeAuditEntry(tx, {
      action: "party_bank_account.create",
      businessId,
      actorUserId,
      entityType: "party_bank_account",
      entityId: row.id,
      changes: {
        partyId,
        bankAccountNumberLast4: row.bankAccountNumber.slice(-4),
        bankName: row.bankName,
        isDefault: row.isDefault,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return row;
  });
}

export async function updatePartyBankAccount(
  partyId: string,
  accountId: string,
  input: UpdatePartyBankAccountInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PartyBankAccount> {
  return db.transaction(async (tx) => {
    const { businessId } = await loadAndAuthorizeParty(tx, actorUserId, partyId);

    const existing = await getPartyBankAccountByIdTx(tx, accountId);
    if (!existing || existing.partyId !== partyId) {
      throw new NotFoundError("Bank account not found");
    }

    const updated = await updatePartyBankAccountTx(tx, accountId, {
      bankAccountNumber: input.bankAccountNumber ?? undefined,
      ifsc: input.ifsc === undefined ? undefined : input.ifsc,
      accountHolderName:
        input.accountHolderName === undefined
          ? undefined
          : input.accountHolderName,
      bankName: input.bankName === undefined ? undefined : input.bankName,
      branchName:
        input.branchName === undefined ? undefined : input.branchName,
      upiId: input.upiId === undefined ? undefined : input.upiId,
      isDefault: input.isDefault ?? undefined,
    });

    if (input.isDefault === true) {
      await unsetOtherDefaultsForPartyTx(tx, partyId, accountId);
    }

    await writeAuditEntry(tx, {
      action: "party_bank_account.update",
      businessId,
      actorUserId,
      entityType: "party_bank_account",
      entityId: accountId,
      changes: { partyId, patch: input },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return updated;
  });
}

export async function deletePartyBankAccount(
  partyId: string,
  accountId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const { businessId } = await loadAndAuthorizeParty(tx, actorUserId, partyId);

    const existing = await getPartyBankAccountByIdTx(tx, accountId);
    if (!existing || existing.partyId !== partyId) {
      throw new NotFoundError("Bank account not found");
    }

    await softDeletePartyBankAccountTx(tx, accountId);

    await writeAuditEntry(tx, {
      action: "party_bank_account.delete",
      businessId,
      actorUserId,
      entityType: "party_bank_account",
      entityId: accountId,
      changes: {
        partyId,
        bankAccountNumberLast4: existing.bankAccountNumber.slice(-4),
        bankName: existing.bankName,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export { listPartyBankAccountsForParty };
