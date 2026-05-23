/**
 * party shipping addresses — multi-address service.
 *
 * Mirrors the bank-accounts service: subordinate to the parent party,
 * gated on `party:edit`. Default-flag invariant enforced server-side at
 * most one default shipping per party.
 *
 * Coexists with the V1.0 single-default helpers in party-addresses.ts —
 * those still drive the New-party form's "Same as billing" toggle, since
 * a brand-new party only ever has one shipping row. Multi-shipping kicks
 * in on the edit page and on the invoice form.
 */
import "server-only";

import { db, type Tx } from "../db";
import type { PartyAddress } from "../db/schema";
import { NotFoundError } from "../errors";
import { writeAuditEntry } from "../audit";
import { requirePermission } from "../rbac";
import { getPartyForUserTx } from "../repositories/parties";
import {
  findShippingAddressByIdTx,
  insertShippingAddressTx,
  listShippingAddressesForParty,
  listShippingAddressesForPartyTx,
  softDeleteShippingAddressTx,
  unsetOtherDefaultShippingTx,
  updateShippingAddressTx,
} from "../repositories/party-addresses";
import type {
  CreatePartyShippingAddressInput,
  UpdatePartyShippingAddressInput,
} from "../schemas/party-shipping-address";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

async function loadAndAuthorizeParty(
  tx: Tx,
  actorUserId: string,
  partyId: string,
): Promise<{ businessId: string }> {
  const party = await getPartyForUserTx(tx, actorUserId, partyId);
  if (!party) throw new NotFoundError("Party not found");
  await requirePermission(actorUserId, party.businessId, "party:edit");
  return { businessId: party.businessId };
}

export async function createPartyShippingAddress(
  partyId: string,
  input: CreatePartyShippingAddressInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PartyAddress> {
  return db.transaction(async (tx) => {
    const { businessId } = await loadAndAuthorizeParty(
      tx,
      actorUserId,
      partyId,
    );

    const existing = await listShippingAddressesForPartyTx(tx, partyId);
    const isDefault = input.isDefault ?? existing.length === 0;

    const row = await insertShippingAddressTx(tx, {
      businessId,
      partyId,
      address: {
        label: input.label,
        streetAddress: input.streetAddress ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        stateCode: input.stateCode ?? null,
        pincode: input.pincode ?? null,
        isDefault,
      },
    });

    if (isDefault) {
      await unsetOtherDefaultShippingTx(tx, partyId, row.id);
    }

    await writeAuditEntry(tx, {
      action: "party_shipping_address.create",
      businessId,
      actorUserId,
      entityType: "party_address",
      entityId: row.id,
      changes: { partyId, label: row.label, isDefault: row.isDefault },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return row;
  });
}

export async function updatePartyShippingAddress(
  partyId: string,
  shippingId: string,
  input: UpdatePartyShippingAddressInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PartyAddress> {
  return db.transaction(async (tx) => {
    const { businessId } = await loadAndAuthorizeParty(
      tx,
      actorUserId,
      partyId,
    );

    const existing = await findShippingAddressByIdTx(tx, shippingId);
    if (!existing || existing.partyId !== partyId) {
      throw new NotFoundError("Shipping address not found");
    }

    const updated = await updateShippingAddressTx(tx, shippingId, {
      label: input.label ?? undefined,
      streetAddress:
        input.streetAddress === undefined ? undefined : input.streetAddress,
      city: input.city === undefined ? undefined : input.city,
      state: input.state === undefined ? undefined : input.state,
      stateCode:
        input.stateCode === undefined ? undefined : input.stateCode,
      pincode: input.pincode === undefined ? undefined : input.pincode,
      isDefault: input.isDefault ?? undefined,
    });

    if (input.isDefault === true) {
      await unsetOtherDefaultShippingTx(tx, partyId, shippingId);
    }

    await writeAuditEntry(tx, {
      action: "party_shipping_address.update",
      businessId,
      actorUserId,
      entityType: "party_address",
      entityId: shippingId,
      changes: { partyId, patch: input },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return updated;
  });
}

export async function deletePartyShippingAddress(
  partyId: string,
  shippingId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const { businessId } = await loadAndAuthorizeParty(
      tx,
      actorUserId,
      partyId,
    );

    const existing = await findShippingAddressByIdTx(tx, shippingId);
    if (!existing || existing.partyId !== partyId) {
      throw new NotFoundError("Shipping address not found");
    }

    await softDeleteShippingAddressTx(tx, shippingId);

    await writeAuditEntry(tx, {
      action: "party_shipping_address.delete",
      businessId,
      actorUserId,
      entityType: "party_address",
      entityId: shippingId,
      changes: { partyId, label: existing.label },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

export { listShippingAddressesForParty };
