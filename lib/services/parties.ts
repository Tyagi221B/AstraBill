/**
 * parties service — RBAC + audit, thin over the party repository.
 *
 * Tenant model: parties belong to one business; tenant isolation goes
 * through `business_members` (the repository's *ForUser helpers). Type
 * (customer/supplier) is pure UI metadata — it drives the default CTA on
 * the detail page and nothing else; ledger sign / receivable / payable
 * comes from the ledger, not from the type. See decision/full-ledger-pivot.
 *
 * Soft delete (deleted_at) rather than hard delete — historical documents
 * keep their party reference; the row stays for audit.
 */
import "server-only";

import { db, type Tx } from "../db";
import type { Party } from "../db/schema";
import { NotFoundError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type {
  CreatePartyInput,
  UpdatePartyInput,
} from "../schemas/party";
import {
  businessHasPartyNamedTx,
  findPartyById,
  getPartyForUser,
  getPartyForUserTx,
  insertPartyTx,
  listPartiesForUser,
  softDeletePartyTx,
  updatePartyTx,
} from "../repositories/parties";

/** The walk-in customer that holds cash sales. Created once per business. */
export const CASH_SALE_PARTY_NAME = "Cash Sale";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createParty(
  input: CreatePartyInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Party> {
  await requirePermission(actorUserId, input.businessId, "party:create");

  return db.transaction(async (tx) => {
    const row = await insertPartyTx(tx, {
      businessId: input.businessId,
      type: input.type,
      name: input.name,
      mobileNumber: input.mobileNumber ?? null,
      email: input.email ?? null,
      gstin: input.gstin ?? null,
      panNumber: input.panNumber ?? null,
      categoryId: input.categoryId ?? null,
      creditPeriodDays: input.creditPeriodDays ?? 30,
      creditLimit: input.creditLimit ?? "0",
      contactPersonName: input.contactPersonName ?? null,
      contactPersonDob: input.contactPersonDob ?? null,
      notes: input.notes ?? null,
    });

    await writeAuditEntry(tx, {
      action: "party.create",
      businessId: input.businessId,
      actorUserId,
      entityType: "party",
      entityId: row.id,
      changes: {
        name: row.name,
        type: row.type,
        hasGstin: row.gstin !== null,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return row;
  });
}

export async function updateParty(
  partyId: string,
  input: UpdatePartyInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Party> {
  return db.transaction(async (tx) => {
    const existing = await getPartyForUserTx(tx, actorUserId, partyId);
    if (!existing) throw new NotFoundError("Party not found");
    await requirePermission(actorUserId, existing.businessId, "party:edit");

    const updated = await updatePartyTx(tx, partyId, input);

    await writeAuditEntry(tx, {
      action: "party.update",
      businessId: existing.businessId,
      actorUserId,
      entityType: "party",
      entityId: partyId,
      changes: input,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}

export async function deleteParty(
  partyId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getPartyForUserTx(tx, actorUserId, partyId);
    if (!existing) throw new NotFoundError("Party not found");
    await requirePermission(actorUserId, existing.businessId, "party:delete");

    // The "Cash Sale" walk-in is structural — never deletable.
    if (existing.name === CASH_SALE_PARTY_NAME) {
      throw new NotFoundError("Party not found");
    }

    await softDeletePartyTx(tx, partyId);

    await writeAuditEntry(tx, {
      action: "party.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "party",
      entityId: partyId,
      changes: { name: existing.name, type: existing.type },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export async function getParty(
  partyId: string,
  actorUserId: string,
): Promise<Party | null> {
  return getPartyForUser(actorUserId, partyId);
}

// Idempotent seed used by createBusiness — keeps the parties table writes
// flowing through this service file alone.
export async function ensureCashSalePartyTx(
  tx: Tx,
  businessId: string,
): Promise<Party | null> {
  const exists = await businessHasPartyNamedTx(
    tx,
    businessId,
    CASH_SALE_PARTY_NAME,
  );
  if (exists) return null;
  return insertPartyTx(tx, {
    businessId,
    type: "customer",
    name: CASH_SALE_PARTY_NAME,
    creditPeriodDays: 0,
    creditLimit: "0",
  });
}

export { findPartyById, listPartiesForUser };
