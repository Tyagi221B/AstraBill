/**
 * item_categories service — RBAC + audit, thin over the repository.
 *
 * `item_category:manage` covers create/delete for V1 (rename via the same
 * permission). Categories are workspace-scoped; the unique partial index
 * on (business_id, name) catches duplicates at the DB level. Service maps
 * the resulting Postgres error to a friendly message.
 */
import "server-only";

import { db } from "../db";
import type { ItemCategory } from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type { CreateItemCategoryInput } from "../schemas/item-category";
import {
  getItemCategoryForUserTx,
  insertItemCategoryTx,
  listItemCategoriesForUser,
  softDeleteItemCategoryTx,
} from "../repositories/item-categories";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createItemCategory(
  input: CreateItemCategoryInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<ItemCategory> {
  await requirePermission(
    actorUserId,
    input.businessId,
    "item_category:manage",
  );

  try {
    return await db.transaction(async (tx) => {
      const row = await insertItemCategoryTx(tx, {
        businessId: input.businessId,
        name: input.name,
      });
      await writeAuditEntry(tx, {
        action: "item_category.create",
        businessId: input.businessId,
        actorUserId,
        entityType: "item_category",
        entityId: row.id,
        changes: { name: row.name },
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return row;
    });
  } catch (err) {
    // The DB's partial unique index on (business_id, name WHERE deleted_at
    // IS NULL) raises 23505 on a dup — map to a friendly 400.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw new ValidationError(
        `A category called "${input.name}" already exists`,
      );
    }
    throw err;
  }
}

export async function deleteItemCategory(
  categoryId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getItemCategoryForUserTx(
      tx,
      actorUserId,
      categoryId,
    );
    if (!existing) throw new NotFoundError("Category not found");
    await requirePermission(
      actorUserId,
      existing.businessId,
      "item_category:manage",
    );

    await softDeleteItemCategoryTx(tx, categoryId);
    await writeAuditEntry(tx, {
      action: "item_category.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "item_category",
      entityId: categoryId,
      changes: { name: existing.name },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export { listItemCategoriesForUser };
