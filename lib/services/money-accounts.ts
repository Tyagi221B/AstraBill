/**
 * money_accounts service — RBAC + audit, thin over the repository.
 *
 * Ledger model:
 *   - Create with opening balance > 0 ⇒ one `opening_balance` ledger row
 *     (debit, money_account_id only) so balance and ledger are in sync from
 *     day one.
 *   - Add Money ⇒ one `manual_adjustment` debit row.
 *   - Reduce Money ⇒ one `manual_adjustment` credit row.
 *   - Transfer A → B ⇒ TWO rows in the same tx sharing a fresh
 *     `transfer_pair_id`: A.credit (`transfer_out`) + B.debit (`transfer_in`).
 *   - Soft delete only when running balance == 0 — otherwise the books
 *     wouldn't balance after the row is hidden.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";

import { db, type Tx } from "../db";
import type { MoneyAccount } from "../db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type {
  AdjustMoneyAccountInput,
  CreateMoneyAccountInput,
  TransferMoneyAccountInput,
  UpdateMoneyAccountInput,
} from "../schemas/money-account";
import {
  balanceForMoneyAccountTx,
  insertLedgerEntryTx,
} from "../repositories/ledger-entries";
import {
  businessHasMoneyAccountOfTypeTx,
  clearDefaultForTypeTx,
  getMoneyAccountForUser,
  getMoneyAccountForUserTx,
  insertMoneyAccountTx,
  listMoneyAccountsForUser,
  softDeleteMoneyAccountTx,
  updateMoneyAccountTx,
} from "../repositories/money-accounts";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createMoneyAccount(
  input: CreateMoneyAccountInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<MoneyAccount> {
  await requirePermission(
    actorUserId,
    input.businessId,
    "money_account:manage",
  );

  return db.transaction(async (tx) => {
    // If asked to set this as default, demote the existing default first.
    if (input.isDefault) {
      await clearDefaultForTypeTx(tx, input.businessId, input.type);
    }

    const account = await insertMoneyAccountTx(tx, {
      businessId: input.businessId,
      type: input.type,
      name: input.name,
      isDefault: input.isDefault ?? false,
      bankAccountNumber:
        input.type === "bank" ? input.bankAccountNumber ?? null : null,
      ifsc: input.type === "bank" ? input.ifsc ?? null : null,
      accountHolderName:
        input.type === "bank" ? input.accountHolderName ?? null : null,
      bankName: input.type === "bank" ? input.bankName ?? null : null,
      branchName: input.type === "bank" ? input.branchName ?? null : null,
      upiId: input.type === "bank" ? input.upiId ?? null : null,
    });

    // Opening balance IS a ledger entry — only write one when > 0.
    if (input.openingBalance) {
      const opening = new Decimal(input.openingBalance);
      if (opening.gt(0)) {
        await insertLedgerEntryTx(tx, {
          businessId: account.businessId,
          voucherType: "opening_balance",
          entryDate: input.openingBalanceAsOfDate,
          moneyAccountId: account.id,
          debitAmount: opening.toFixed(2),
          narration: "Opening balance",
        });
      } else if (opening.lt(0)) {
        throw new ValidationError(
          "Opening balance must be zero or positive on a money account",
        );
      }
    }

    await writeAuditEntry(tx, {
      action: "money_account.create",
      businessId: input.businessId,
      actorUserId,
      entityType: "money_account",
      entityId: account.id,
      changes: {
        name: account.name,
        type: account.type,
        hasOpeningBalance: Number(input.openingBalance ?? "0") > 0,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return account;
  });
}

export async function updateMoneyAccount(
  moneyAccountId: string,
  input: UpdateMoneyAccountInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<MoneyAccount> {
  return db.transaction(async (tx) => {
    const existing = await getMoneyAccountForUserTx(
      tx,
      actorUserId,
      moneyAccountId,
    );
    if (!existing) throw new NotFoundError("Money account not found");
    await requirePermission(
      actorUserId,
      existing.businessId,
      "money_account:manage",
    );

    if (input.isDefault === true && !existing.isDefault) {
      await clearDefaultForTypeTx(tx, existing.businessId, existing.type);
    }

    const updated = await updateMoneyAccountTx(tx, moneyAccountId, input);

    await writeAuditEntry(tx, {
      action: "money_account.update",
      businessId: existing.businessId,
      actorUserId,
      entityType: "money_account",
      entityId: moneyAccountId,
      changes: input,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}

/**
 * Soft-delete a money account — refused if running balance ≠ 0. Books-side
 * invariant: hiding a non-empty cash drawer would leave money on the ledger
 * with no surface to clear it. Owner must transfer or reduce to zero first.
 */
export async function deleteMoneyAccount(
  moneyAccountId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getMoneyAccountForUserTx(
      tx,
      actorUserId,
      moneyAccountId,
    );
    if (!existing) throw new NotFoundError("Money account not found");
    await requirePermission(
      actorUserId,
      existing.businessId,
      "money_account:manage",
    );

    const balance = await balanceForMoneyAccountTx(tx, moneyAccountId);
    if (new Decimal(balance).abs().gt(0)) {
      throw new ValidationError(
        `This account has a non-zero balance (${balance}). Transfer or reduce to zero before deleting.`,
      );
    }

    await softDeleteMoneyAccountTx(tx, moneyAccountId);

    await writeAuditEntry(tx, {
      action: "money_account.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "money_account",
      entityId: moneyAccountId,
      changes: { name: existing.name },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

/**
 * Add or Reduce money on a single account. Writes ONE manual_adjustment
 * ledger row. Sign convention:
 *   add    ⇒ debit  (money flows INTO the account; balance ↑)
 *   reduce ⇒ credit (money flows OUT;  balance ↓)
 *
 * A reduce that would push balance below zero is still allowed — a cash
 * drawer can legitimately go negative on an IOU pattern and we'd rather
 * the books reflect reality than refuse the entry.
 */
export async function adjustMoneyAccountBalance(
  moneyAccountId: string,
  input: AdjustMoneyAccountInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<{ account: MoneyAccount; balance: string }> {
  return db.transaction(async (tx) => {
    const account = await getMoneyAccountForUserTx(
      tx,
      actorUserId,
      moneyAccountId,
    );
    if (!account) throw new NotFoundError("Money account not found");
    await requirePermission(
      actorUserId,
      account.businessId,
      "money_account:adjust",
    );

    const amount = new Decimal(input.amount).toFixed(2);
    await insertLedgerEntryTx(tx, {
      businessId: account.businessId,
      voucherType: "manual_adjustment",
      entryDate: input.entryDate,
      moneyAccountId: account.id,
      debitAmount: input.direction === "add" ? amount : null,
      creditAmount: input.direction === "reduce" ? amount : null,
      narration: input.notes ?? null,
    });

    await writeAuditEntry(tx, {
      action: "money_account.adjust",
      businessId: account.businessId,
      actorUserId,
      entityType: "money_account",
      entityId: account.id,
      changes: {
        direction: input.direction,
        amount,
        notes: input.notes ?? null,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    const balance = await balanceForMoneyAccountTx(tx, account.id);
    return { account, balance };
  });
}

/**
 * Transfer money A → B. Writes TWO ledger_entries rows in the same tx,
 * sharing a fresh `transfer_pair_id`:
 *   leg 1: A's credit (money out), voucher_type='transfer_out'
 *   leg 2: B's debit  (money in),  voucher_type='transfer_in'
 *
 * Both legs are required to authorise — the actor must be a member of the
 * business and have `money_account:transfer`. Cross-business transfers are
 * structurally impossible (both legs scope to the same business via the
 * accounts' business_id).
 */
export async function transferBetweenMoneyAccounts(
  input: TransferMoneyAccountInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<{ from: MoneyAccount; to: MoneyAccount; balances: { from: string; to: string } }> {
  return db.transaction(async (tx) => {
    const from = await getMoneyAccountForUserTx(
      tx,
      actorUserId,
      input.fromAccountId,
    );
    if (!from) throw new NotFoundError("Source account not found");
    const to = await getMoneyAccountForUserTx(
      tx,
      actorUserId,
      input.toAccountId,
    );
    if (!to) throw new NotFoundError("Destination account not found");
    if (from.businessId !== to.businessId) {
      // Membership scope would have already caught this; double-check.
      throw new ForbiddenError("Transfers must stay within one business");
    }
    await requirePermission(
      actorUserId,
      from.businessId,
      "money_account:transfer",
    );

    const amount = new Decimal(input.amount).toFixed(2);
    const pairId = randomUUID();

    await insertLedgerEntryTx(tx, {
      businessId: from.businessId,
      voucherType: "transfer_out",
      entryDate: input.entryDate,
      moneyAccountId: from.id,
      creditAmount: amount,
      narration: input.notes ?? `Transfer to ${to.name}`,
      transferPairId: pairId,
    });
    await insertLedgerEntryTx(tx, {
      businessId: to.businessId,
      voucherType: "transfer_in",
      entryDate: input.entryDate,
      moneyAccountId: to.id,
      debitAmount: amount,
      narration: input.notes ?? `Transfer from ${from.name}`,
      transferPairId: pairId,
    });

    await writeAuditEntry(tx, {
      action: "money_account.transfer",
      businessId: from.businessId,
      actorUserId,
      entityType: "money_account",
      entityId: from.id,
      changes: {
        fromId: from.id,
        toId: to.id,
        amount,
        transferPairId: pairId,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    const [fromBal, toBal] = await Promise.all([
      balanceForMoneyAccountTx(tx, from.id),
      balanceForMoneyAccountTx(tx, to.id),
    ]);
    return { from, to, balances: { from: fromBal, to: toBal } };
  });
}

/**
 * Idempotent — creates the default `Cash in hand` account only if the
 * business doesn't already have any cash account. Called from
 * createBusiness inside its own transaction.
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

export async function getMoneyAccount(
  moneyAccountId: string,
  actorUserId: string,
) {
  return getMoneyAccountForUser(actorUserId, moneyAccountId);
}

export { listMoneyAccountsForUser };
