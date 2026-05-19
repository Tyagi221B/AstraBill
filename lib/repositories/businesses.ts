/**
 * Business repository — the only place Drizzle queries for the businesses /
 * business_members tables live. Tenant isolation: queries that read a
 * business's data always scope by the membership (caller's userId).
 */
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type Business,
  type BusinessMember,
  type NewBusiness,
  type NewBusinessMember,
  type Role,
  businessMembers,
  businesses,
} from "../db/schema";

export async function insertBusiness(
  tx: Tx,
  values: NewBusiness,
): Promise<Business> {
  const [row] = await tx.insert(businesses).values(values).returning();
  if (!row) throw new Error("Insert business returned no row");
  return row;
}

export async function insertMember(
  tx: Tx,
  values: NewBusinessMember,
): Promise<BusinessMember> {
  const [row] = await tx.insert(businessMembers).values(values).returning();
  if (!row) throw new Error("Insert business_members returned no row");
  return row;
}

/**
 * Every business this user is an active (non-soft-deleted) member of, with
 * the membership row attached. Ordered most-recent-business first.
 */
export async function listBusinessesForUser(
  userId: string,
): Promise<
  Array<{ business: Business; membership: BusinessMember }>
> {
  const rows = await db.query.businessMembers.findMany({
    where: and(
      eq(businessMembers.userId, userId),
      isNull(businessMembers.deletedAt),
    ),
    with: { business: true },
    orderBy: [desc(businessMembers.createdAt)],
  });
  return rows
    .filter((r) => r.business && r.business.deletedAt === null)
    .map((r) => ({ business: r.business, membership: r }));
}

/**
 * Transaction-bound: the business by id, plus the caller's role in it.
 * Returns null if the business doesn't exist, is soft-deleted, or the user
 * isn't an active member — callers treat all three as 404 (no existence leak).
 */
export async function getBusinessForUserTx(
  tx: Tx,
  userId: string,
  businessId: string,
): Promise<{ business: Business; role: Role } | null> {
  const [business] = await tx
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt)));
  if (!business) return null;

  const [member] = await tx
    .select({ role: businessMembers.role })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return null;
  return { business, role: member.role };
}

/** Patch a business row. `updatedAt` auto-bumps via the column's $onUpdate. */
export async function updateBusinessRow(
  tx: Tx,
  businessId: string,
  patch: Partial<NewBusiness>,
): Promise<Business> {
  const [row] = await tx
    .update(businesses)
    .set(patch)
    .where(eq(businesses.id, businessId))
    .returning();
  if (!row) throw new Error("Update businesses returned no row");
  return row;
}
