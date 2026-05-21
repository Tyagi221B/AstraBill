/**
 * item_categories repository — workspace-scoped, soft-delete-aware.
 * Unique (business_id, name) where deleted_at IS NULL is enforced by the
 * partial unique index defined in schema.ts.
 */
import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type ItemCategory,
  type NewItemCategory,
  businessMembers,
  itemCategories,
} from "../db/schema";

export async function insertItemCategoryTx(
  tx: Tx,
  values: NewItemCategory,
): Promise<ItemCategory> {
  const [row] = await tx.insert(itemCategories).values(values).returning();
  if (!row) throw new Error("Insert item_category returned no row");
  return row;
}

export async function listItemCategoriesForUser(opts: {
  userId: string;
  businessId: string;
}): Promise<ItemCategory[]> {
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
    .from(itemCategories)
    .where(
      and(
        eq(itemCategories.businessId, opts.businessId),
        isNull(itemCategories.deletedAt),
      ),
    )
    .orderBy(asc(itemCategories.name));
}

export async function getItemCategoryForUserTx(
  tx: Tx,
  userId: string,
  categoryId: string,
): Promise<ItemCategory | null> {
  const [cat] = await tx
    .select()
    .from(itemCategories)
    .where(
      and(eq(itemCategories.id, categoryId), isNull(itemCategories.deletedAt)),
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

export async function softDeleteItemCategoryTx(
  tx: Tx,
  categoryId: string,
): Promise<void> {
  await tx
    .update(itemCategories)
    .set({ deletedAt: new Date() })
    .where(eq(itemCategories.id, categoryId));
}
