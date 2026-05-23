/**
 * party_custom_field_definitions service — RBAC + audit, thin over repo.
 *
 * Uses `party_custom_field:manage` (owner / admin / accountant). Mirrors
 * the item_category / party_category services in shape.
 *
 * Soft delete: parties already carrying a value for a deleted definition
 * keep the value row (foreign key has cascade-on-definition-delete only
 * for hard delete, which we never do). The PartyForm renderer filters
 * definitions to non-deleted, so deleted defs effectively disappear from
 * the UI while their historical values remain available for reports.
 */
import "server-only";

import { db } from "../db";
import type { PartyCustomFieldDefinition } from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type {
  CreatePartyCustomFieldDefInput,
  UpdatePartyCustomFieldDefInput,
} from "../schemas/party-custom-field";
import {
  getPartyCustomFieldDefForUserTx,
  insertPartyCustomFieldDefTx,
  listPartyCustomFieldDefsForUser,
  softDeletePartyCustomFieldDefTx,
  updatePartyCustomFieldDefTx,
} from "../repositories/party-custom-fields";

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
    throw new ValidationError(`A field called "${name}" already exists`);
  }
  throw err;
}

export async function createPartyCustomFieldDef(
  input: CreatePartyCustomFieldDefInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PartyCustomFieldDefinition> {
  await requirePermission(
    actorUserId,
    input.businessId,
    "party_custom_field:manage",
  );

  try {
    return await db.transaction(async (tx) => {
      const row = await insertPartyCustomFieldDefTx(tx, {
        businessId: input.businessId,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
      });
      await writeAuditEntry(tx, {
        action: "party_custom_field.create",
        businessId: input.businessId,
        actorUserId,
        entityType: "party_custom_field_definition",
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

export async function updatePartyCustomFieldDef(
  defId: string,
  input: UpdatePartyCustomFieldDefInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PartyCustomFieldDefinition> {
  try {
    return await db.transaction(async (tx) => {
      const existing = await getPartyCustomFieldDefForUserTx(
        tx,
        actorUserId,
        defId,
      );
      if (!existing) throw new NotFoundError("Field not found");
      await requirePermission(
        actorUserId,
        existing.businessId,
        "party_custom_field:manage",
      );

      const updated = await updatePartyCustomFieldDefTx(tx, defId, {
        name: input.name ?? undefined,
        sortOrder: input.sortOrder ?? undefined,
      });

      await writeAuditEntry(tx, {
        action: "party_custom_field.update",
        businessId: existing.businessId,
        actorUserId,
        entityType: "party_custom_field_definition",
        entityId: defId,
        changes: { from: existing.name, to: updated.name },
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      return updated;
    });
  } catch (err) {
    mapUniqueViolation(err, input.name ?? "");
  }
}

export async function deletePartyCustomFieldDef(
  defId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getPartyCustomFieldDefForUserTx(
      tx,
      actorUserId,
      defId,
    );
    if (!existing) throw new NotFoundError("Field not found");
    await requirePermission(
      actorUserId,
      existing.businessId,
      "party_custom_field:manage",
    );

    await softDeletePartyCustomFieldDefTx(tx, defId);
    await writeAuditEntry(tx, {
      action: "party_custom_field.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "party_custom_field_definition",
      entityId: defId,
      changes: { name: existing.name },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export { listPartyCustomFieldDefsForUser };
