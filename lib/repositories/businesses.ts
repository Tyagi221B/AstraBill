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
