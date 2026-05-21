/**
 * money_accounts repository — every business has at least one (default Cash,
 * auto-created at business creation). Every payment_entry references exactly
 * one money_account.
 *
 * Tenant isolation: every helper that doesn't take a `tx` directly scopes by
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
