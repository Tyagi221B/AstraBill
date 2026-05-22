/**
 * money_accounts repository — every business has at least one (default Cash,
 * auto-created at business creation). Every payment_entry references exactly
 * one money_account.
 *
 * Tenant isolation: every helper that doesn't take a `tx` scopes by
 * `business_id` (resolved through the caller's `business_members` row). The
 * `*Tx` variants are for use inside an enclosing transaction.
 */
import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type MoneyAccount,
  type NewMoneyAccount,
  businessMembers,
  moneyAccounts,
} from "../db/schema";

export async function insertMoneyAccountTx(
  tx: Tx,
  values: NewMoneyAccount,
): Promise<MoneyAccount> {
  const [row] = await tx.insert(moneyAccounts).values(values).returning();
  if (!row) throw new Error("Insert money_account returned no row");
  return row;
}

/**
 * Has the business already got at least one non-deleted money_account of the
 * given type? Used by the createBusiness path to keep the auto-seed idempotent
 * (so a retried business create doesn't insert two Cash accounts).
 */
export async function businessHasMoneyAccountOfTypeTx(
  tx: Tx,
  businessId: string,
  type: MoneyAccount["type"],
): Promise<boolean> {
  const [row] = await tx
    .select({ id: moneyAccounts.id })
    .from(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.businessId, businessId),
        eq(moneyAccounts.type, type),
        isNull(moneyAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * List active money_accounts for a business — only callable when the user is
 * a member. Returns empty for a non-member (no existence leak).
 */
export async function listMoneyAccountsForUser(opts: {
  userId: string;
  businessId: string;
}): Promise<MoneyAccount[]> {
  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, opts.businessId),
        eq(businessMembers.userId, opts.userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return [];

  return db
    .select()
    .from(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.businessId, opts.businessId),
        isNull(moneyAccounts.deletedAt),
      ),
    )
    .orderBy(asc(moneyAccounts.createdAt));
}

export async function getMoneyAccountForUser(
  userId: string,
  moneyAccountId: string,
): Promise<MoneyAccount | null> {
  const [acc] = await db
    .select()
    .from(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.id, moneyAccountId),
        isNull(moneyAccounts.deletedAt),
      ),
    );
  if (!acc) return null;

  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, acc.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? acc : null;
}

export async function getMoneyAccountForUserTx(
  tx: Tx,
  userId: string,
  moneyAccountId: string,
): Promise<MoneyAccount | null> {
  const [acc] = await tx
    .select()
    .from(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.id, moneyAccountId),
        isNull(moneyAccounts.deletedAt),
      ),
    );
  if (!acc) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, acc.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? acc : null;
}

export interface MoneyAccountPatch {
  name?: string;
  isDefault?: boolean;
  bankAccountNumber?: string | null;
  ifsc?: string | null;
  accountHolderName?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  upiId?: string | null;
}

export async function updateMoneyAccountTx(
  tx: Tx,
  moneyAccountId: string,
  patch: MoneyAccountPatch,
): Promise<MoneyAccount> {
  const [row] = await tx
    .update(moneyAccounts)
    .set(patch)
    .where(eq(moneyAccounts.id, moneyAccountId))
    .returning();
  if (!row) throw new Error("Update money_account returned no row");
  return row;
}

/**
 * Unset `is_default` on every other account of the same type in the same
 * business — used when promoting a new default. The partial unique index
 * `money_accounts_business_default_uq` enforces only one default per (biz,
 * type), so we have to clear the old one before setting the new one.
 */
export async function clearDefaultForTypeTx(
  tx: Tx,
  businessId: string,
  type: MoneyAccount["type"],
): Promise<void> {
  await tx
    .update(moneyAccounts)
    .set({ isDefault: false })
    .where(
      and(
        eq(moneyAccounts.businessId, businessId),
        eq(moneyAccounts.type, type),
        eq(moneyAccounts.isDefault, true),
        isNull(moneyAccounts.deletedAt),
      ),
    );
}

export async function softDeleteMoneyAccountTx(
  tx: Tx,
  moneyAccountId: string,
): Promise<void> {
  await tx
    .update(moneyAccounts)
    .set({ deletedAt: new Date() })
    .where(eq(moneyAccounts.id, moneyAccountId));
}
