/**
 * party_addresses repository — billing and shipping addresses for a party.
 *
 * Two address kinds, two persistence shapes:
 *   - `kind='billing'` — at most ONE active row per party (enforced by the
 *     partial unique index `party_addresses_one_billing_uq` on the table).
 *     The address that drives `bill_to` on documents.
 *   - `kind='shipping'` — many allowed. V1 uses exactly one with
 *     `is_default=true` (the "default shipping address"); the rest of the
 *     schema (labels, multiple ship-tos per party) is V1.5.
 *
 * Every helper scopes by `business_id` (tenant invariant). The `*Tx`
 * variants are for use inside an enclosing transaction.
 *
 * Idempotency: `upsert*` helpers run a SELECT-then-INSERT-or-UPDATE within
 * the caller's transaction. The partial unique index guards against double
 * billing rows in the rare race-condition slip.
 */
import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewPartyAddress,
  type PartyAddress,
  partyAddresses,
} from "../db/schema";

/**
 * The address-shaped subset accepted by the service layer. Every field is
 * nullable — V1 lets shops type a partial address (e.g. street + state +
 * pincode, no city). Only `state` is meaningful for tax-class derivation;
 * the rest is presentational.
 */
export interface AddressInput {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
}

/** True when at least one address field carries a non-empty value. */
export function isAddressFilled(addr: AddressInput): boolean {
  return Boolean(
    addr.streetAddress ||
      addr.city ||
      addr.state ||
      addr.stateCode ||
      addr.pincode,
  );
}

/** Read every active address for a party, billing-first then shipping by
 *  default-flag desc + created-at asc. Used by the party detail page and by
 *  the invoice-form party-picker to populate bill-to / ship-to. */
export async function listAddressesForParty(
  partyId: string,
): Promise<PartyAddress[]> {
  return db
    .select()
    .from(partyAddresses)
    .where(
      and(eq(partyAddresses.partyId, partyId), isNull(partyAddresses.deletedAt)),
    )
    .orderBy(asc(partyAddresses.kind), asc(partyAddresses.createdAt));
}

/** Tx-bound variant — used by services that need consistency with their
 *  enclosing party-update transaction. */
export async function listAddressesForPartyTx(
  tx: Tx,
  partyId: string,
): Promise<PartyAddress[]> {
  return tx
    .select()
    .from(partyAddresses)
    .where(
      and(eq(partyAddresses.partyId, partyId), isNull(partyAddresses.deletedAt)),
    )
    .orderBy(asc(partyAddresses.kind), asc(partyAddresses.createdAt));
}

/** Single billing address, or null if none. */
export async function getBillingAddressForParty(
  partyId: string,
): Promise<PartyAddress | null> {
  const [row] = await db
    .select()
    .from(partyAddresses)
    .where(
      and(
        eq(partyAddresses.partyId, partyId),
        eq(partyAddresses.kind, "billing"),
        isNull(partyAddresses.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Default shipping address (the lone `is_default=true` shipping row), or
 *  null if none. */
export async function getDefaultShippingAddressForParty(
  partyId: string,
): Promise<PartyAddress | null> {
  const [row] = await db
    .select()
    .from(partyAddresses)
    .where(
      and(
        eq(partyAddresses.partyId, partyId),
        eq(partyAddresses.kind, "shipping"),
        eq(partyAddresses.isDefault, true),
        isNull(partyAddresses.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Insert or update the single billing row for a party. Returns the
 * resulting row. The partial UQ on `(party_id) where kind='billing' and
 * deleted_at is null` means our SELECT-then-write is safe inside a
 * transaction; the index catches any race that slips through.
 */
export async function upsertBillingAddressTx(
  tx: Tx,
  opts: { businessId: string; partyId: string; address: AddressInput },
): Promise<PartyAddress> {
  const [existing] = await tx
    .select()
    .from(partyAddresses)
    .where(
      and(
        eq(partyAddresses.partyId, opts.partyId),
        eq(partyAddresses.kind, "billing"),
        isNull(partyAddresses.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await tx
      .update(partyAddresses)
      .set({
        streetAddress: opts.address.streetAddress,
        city: opts.address.city,
        state: opts.address.state,
        stateCode: opts.address.stateCode,
        pincode: opts.address.pincode,
      })
      .where(eq(partyAddresses.id, existing.id))
      .returning();
    if (!updated) throw new Error("Update billing address returned no row");
    return updated;
  }

  const values: NewPartyAddress = {
    businessId: opts.businessId,
    partyId: opts.partyId,
    kind: "billing",
    streetAddress: opts.address.streetAddress,
    city: opts.address.city,
    state: opts.address.state,
    stateCode: opts.address.stateCode,
    pincode: opts.address.pincode,
    isDefault: true,
  };
  const [inserted] = await tx
    .insert(partyAddresses)
    .values(values)
    .returning();
  if (!inserted) throw new Error("Insert billing address returned no row");
  return inserted;
}

/**
 * Insert or update the SINGLE default shipping row for a party. V1
 * pattern — one default shipping per party. Additional shipping addresses
 * (multiple ship-tos per party) are V1.5 and would extend this helper.
 */
export async function upsertDefaultShippingAddressTx(
  tx: Tx,
  opts: { businessId: string; partyId: string; address: AddressInput },
): Promise<PartyAddress> {
  const [existing] = await tx
    .select()
    .from(partyAddresses)
    .where(
      and(
        eq(partyAddresses.partyId, opts.partyId),
        eq(partyAddresses.kind, "shipping"),
        eq(partyAddresses.isDefault, true),
        isNull(partyAddresses.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await tx
      .update(partyAddresses)
      .set({
        streetAddress: opts.address.streetAddress,
        city: opts.address.city,
        state: opts.address.state,
        stateCode: opts.address.stateCode,
        pincode: opts.address.pincode,
      })
      .where(eq(partyAddresses.id, existing.id))
      .returning();
    if (!updated) throw new Error("Update shipping address returned no row");
    return updated;
  }

  const values: NewPartyAddress = {
    businessId: opts.businessId,
    partyId: opts.partyId,
    kind: "shipping",
    streetAddress: opts.address.streetAddress,
    city: opts.address.city,
    state: opts.address.state,
    stateCode: opts.address.stateCode,
    pincode: opts.address.pincode,
    isDefault: true,
  };
  const [inserted] = await tx
    .insert(partyAddresses)
    .values(values)
    .returning();
  if (!inserted) throw new Error("Insert shipping address returned no row");
  return inserted;
}

/**
 * Soft-delete the default shipping row. Used when the user toggles
 * "Same as billing" back ON — the shipping row should disappear so it
 * doesn't surface stale data on future invoices.
 */
export async function clearDefaultShippingAddressTx(
  tx: Tx,
  opts: { partyId: string },
): Promise<void> {
  await tx
    .update(partyAddresses)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(partyAddresses.partyId, opts.partyId),
        eq(partyAddresses.kind, "shipping"),
        eq(partyAddresses.isDefault, true),
        isNull(partyAddresses.deletedAt),
      ),
    );
}

/**
 * Lookup an address by id. Used on the invoice form when populating ship-to
 * from a saved address (the user picked a shipping row and we need its
 * fields for the document payload).
 */
export async function findAddressById(
  addressId: string,
): Promise<PartyAddress | null> {
  const [row] = await db
    .select()
    .from(partyAddresses)
    .where(
      and(
        eq(partyAddresses.id, addressId),
        isNull(partyAddresses.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

// =========================================================================
// Multi-shipping helpers (PR7-E)
//
// Extending the V1.0 "single default shipping" pattern to "many labelled
// shipping addresses, one default". The existing single-default helpers
// (upsertDefaultShippingAddressTx, clearDefaultShippingAddressTx, the
// "Same as billing" toggle on the new-party form) stay for backward
// compatibility — multi-shipping kicks in on the edit page + invoice form.
//
// Invariant: at most ONE active shipping row per party has is_default=true.
// Enforced service-side; the repo provides the flip primitive.
// =========================================================================

import { ne } from "drizzle-orm";

/** Every active shipping row for a party (defaults first, then by created). */
export async function listShippingAddressesForParty(
  partyId: string,
): Promise<PartyAddress[]> {
  return db
    .select()
    .from(partyAddresses)
    .where(
      and(
        eq(partyAddresses.partyId, partyId),
        eq(partyAddresses.kind, "shipping"),
        isNull(partyAddresses.deletedAt),
      ),
    )
    .orderBy(asc(partyAddresses.createdAt));
}

export async function listShippingAddressesForPartyTx(
  tx: Tx,
  partyId: string,
): Promise<PartyAddress[]> {
  return tx
    .select()
    .from(partyAddresses)
    .where(
      and(
        eq(partyAddresses.partyId, partyId),
        eq(partyAddresses.kind, "shipping"),
        isNull(partyAddresses.deletedAt),
      ),
    )
    .orderBy(asc(partyAddresses.createdAt));
}

export async function findShippingAddressByIdTx(
  tx: Tx,
  addressId: string,
): Promise<PartyAddress | null> {
  const [row] = await tx
    .select()
    .from(partyAddresses)
    .where(
      and(
        eq(partyAddresses.id, addressId),
        eq(partyAddresses.kind, "shipping"),
        isNull(partyAddresses.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface ShippingAddressInput extends AddressInput {
  /** Required for multi-shipping rows so the UI + invoice picker can
   *  distinguish "Warehouse" from "Branch office" etc. */
  label: string;
  isDefault: boolean;
}

export async function insertShippingAddressTx(
  tx: Tx,
  opts: {
    businessId: string;
    partyId: string;
    address: ShippingAddressInput;
  },
): Promise<PartyAddress> {
  const [row] = await tx
    .insert(partyAddresses)
    .values({
      businessId: opts.businessId,
      partyId: opts.partyId,
      kind: "shipping",
      label: opts.address.label,
      streetAddress: opts.address.streetAddress,
      city: opts.address.city,
      state: opts.address.state,
      stateCode: opts.address.stateCode,
      pincode: opts.address.pincode,
      isDefault: opts.address.isDefault,
    })
    .returning();
  if (!row) throw new Error("Insert shipping address returned no row");
  return row;
}

export interface ShippingAddressPatch {
  label?: string;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  isDefault?: boolean;
}

export async function updateShippingAddressTx(
  tx: Tx,
  addressId: string,
  patch: ShippingAddressPatch,
): Promise<PartyAddress> {
  const [row] = await tx
    .update(partyAddresses)
    .set(patch)
    .where(eq(partyAddresses.id, addressId))
    .returning();
  if (!row) throw new Error("Update shipping address returned no row");
  return row;
}

export async function softDeleteShippingAddressTx(
  tx: Tx,
  addressId: string,
): Promise<void> {
  await tx
    .update(partyAddresses)
    .set({ deletedAt: new Date() })
    .where(eq(partyAddresses.id, addressId));
}

/** Flip every other active shipping row for the party to is_default=false. */
export async function unsetOtherDefaultShippingTx(
  tx: Tx,
  partyId: string,
  exceptId: string,
): Promise<void> {
  await tx
    .update(partyAddresses)
    .set({ isDefault: false })
    .where(
      and(
        eq(partyAddresses.partyId, partyId),
        eq(partyAddresses.kind, "shipping"),
        eq(partyAddresses.isDefault, true),
        ne(partyAddresses.id, exceptId),
        isNull(partyAddresses.deletedAt),
      ),
    );
}
