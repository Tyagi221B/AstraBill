/**
 * party_categories repository — workspace-scoped, soft-delete-aware.
 *
 * Tenant isolation is enforced at the repository layer by checking
 * `business_members` for every read. The partial unique index
 * `party_categories_business_name_uq` on (business_id, name) WHERE
 * deleted_at IS NULL catches duplicates at the DB level; the service
 * layer maps 23505 to a friendly ValidationError.
 */
import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewPartyCategory,
  type PartyCategory,
  businessMembers,
  partyCategories,
} from "../db/schema";

export async function insertPartyCategoryTx(
  tx: Tx,
  values: NewPartyCategory,
): Promise<PartyCategory> {
  const [row] = await tx.insert(partyCategories).values(values).returning();
  if (!row) throw new Error("Insert party_category returned no row");
  return row;
}

export async function listPartyCategoriesForUser(opts: {
  userId: string;
  businessId: string;
}): Promise<PartyCategory[]> {
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
    .from(partyCategories)
    .where(
      and(
        eq(partyCategories.businessId, opts.businessId),
        isNull(partyCategories.deletedAt),
      ),
    )
    .orderBy(asc(partyCategories.name));
}

export async function getPartyCategoryForUserTx(
  tx: Tx,
  userId: string,
  categoryId: string,
): Promise<PartyCategory | null> {
  const [cat] = await tx
    .select()
    .from(partyCategories)
    .where(
      and(
        eq(partyCategories.id, categoryId),
        isNull(partyCategories.deletedAt),
      ),
    );
  if (!cat) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, cat.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? cat : null;
}

export async function updatePartyCategoryTx(
  tx: Tx,
  categoryId: string,
  patch: { name: string },
): Promise<PartyCategory> {
  const [row] = await tx
    .update(partyCategories)
    .set({ name: patch.name })
    .where(eq(partyCategories.id, categoryId))
    .returning();
  if (!row) throw new Error("Update party_category returned no row");
  return row;
}

export async function softDeletePartyCategoryTx(
  tx: Tx,
  categoryId: string,
): Promise<void> {
  await tx
    .update(partyCategories)
    .set({ deletedAt: new Date() })
    .where(eq(partyCategories.id, categoryId));
}
