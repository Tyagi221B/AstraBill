/**
 * party_categories service — RBAC + audit, thin over the repository.
 *
 * Uses `party_category:manage` (owner / admin / accountant). Categories are
 * workspace-scoped; the partial unique index on (business_id, name WHERE
 * deleted_at IS NULL) catches duplicates at the DB level — the service maps
 * the 23505 to a friendly ValidationError.
 *
 * Soft delete: parties already tagged with a deleted category keep their
 * `category_id`. The detail / list UIs render "—" for a dangling reference
 * (matches the item_categories pattern). Historical context is preserved on
 * purpose; we never bulk-update party rows on category deletion.
 */
import "server-only";

import { db } from "../db";
import type { PartyCategory } from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type {
  CreatePartyCategoryInput,
  UpdatePartyCategoryInput,
} from "../schemas/party-category";
import {
  getPartyCategoryForUserTx,
  insertPartyCategoryTx,
  listPartyCategoriesForUser,
  softDeletePartyCategoryTx,
  updatePartyCategoryTx,
} from "../repositories/party-categories";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

function mapUniqueViolation(err: unknown, name: string): never {
  if (
    err instanceof Error &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  ) {
    throw new ValidationError(
      `A category called "${name}" already exists`,
    );
  }
  throw err;
}

export async function createPartyCategory(
  input: CreatePartyCategoryInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PartyCategory> {
  await requirePermission(
    actorUserId,
    input.businessId,
    "party_category:manage",
  );

  try {
    return await db.transaction(async (tx) => {
      const row = await insertPartyCategoryTx(tx, {
        businessId: input.businessId,
        name: input.name,
      });
      await writeAuditEntry(tx, {
        action: "party_category.create",
        businessId: input.businessId,
        actorUserId,
        entityType: "party_category",
        entityId: row.id,
        changes: { name: row.name },
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return row;
    });
  } catch (err) {
    mapUniqueViolation(err, input.name);
  }
}

export async function updatePartyCategory(
  categoryId: string,
  input: UpdatePartyCategoryInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PartyCategory> {
  try {
    return await db.transaction(async (tx) => {
      const existing = await getPartyCategoryForUserTx(
        tx,
        actorUserId,
        categoryId,
      );
      if (!existing) throw new NotFoundError("Category not found");
      await requirePermission(
        actorUserId,
        existing.businessId,
        "party_category:manage",
      );

      const updated = await updatePartyCategoryTx(tx, categoryId, {
        name: input.name,
      });
      await writeAuditEntry(tx, {
        action: "party_category.update",
        businessId: existing.businessId,
        actorUserId,
        entityType: "party_category",
        entityId: categoryId,
        changes: { from: existing.name, to: updated.name },
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return updated;
    });
  } catch (err) {
    mapUniqueViolation(err, input.name);
  }
}

export async function deletePartyCategory(
  categoryId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getPartyCategoryForUserTx(
      tx,
      actorUserId,
      categoryId,
    );
    if (!existing) throw new NotFoundError("Category not found");
    await requirePermission(
      actorUserId,
      existing.businessId,
      "party_category:manage",
    );

    await softDeletePartyCategoryTx(tx, categoryId);
    await writeAuditEntry(tx, {
      action: "party_category.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "party_category",
      entityId: categoryId,
      changes: { name: existing.name },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export { listPartyCategoriesForUser };
