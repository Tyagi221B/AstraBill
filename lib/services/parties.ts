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
import { ConflictError, NotFoundError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type {
  AddressInputZ,
  CreatePartyInput,
  OpeningBalanceInputZ,
  ShippingPolicy,
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
import {
  type AddressInput,
  clearDefaultShippingAddressTx,
  isAddressFilled,
  upsertBillingAddressTx,
  upsertDefaultShippingAddressTx,
} from "../repositories/party-addresses";
import {
  deleteLedgerEntryByIdTx,
  getOpeningBalanceEntryForPartyTx,
  hasNonOpeningActivityForPartyTx,
  insertLedgerEntryTx,
} from "../repositories/ledger-entries";

/** Map the Zod-validated address payload (every field optional) to the
 *  repository's nullable-everywhere shape. Empty strings become null so
 *  the column never holds a meaningless blank. */
function toAddressInput(addr: AddressInputZ): AddressInput {
  return {
    streetAddress: addr.streetAddress?.trim() || null,
    city: addr.city?.trim() || null,
    state: addr.state?.trim() || null,
    stateCode: addr.stateCode?.trim() || null,
    pincode: addr.pincode?.trim() || null,
  };
}

/** Apply the address-related slice of a party create/update payload inside
 *  the caller's transaction. Idempotent: omitted billing leaves rows
 *  untouched; sameAsBilling=true soft-deletes any default shipping row. */
async function applyAddressesTx(
  tx: Tx,
  opts: {
    businessId: string;
    partyId: string;
    billingAddress?: AddressInputZ | null | undefined;
    shipping?: ShippingPolicy | undefined;
  },
): Promise<void> {
  if (opts.billingAddress) {
    const billing = toAddressInput(opts.billingAddress);
    if (isAddressFilled(billing)) {
      await upsertBillingAddressTx(tx, {
        businessId: opts.businessId,
        partyId: opts.partyId,
        address: billing,
      });
    }
  }

  if (opts.shipping) {
    if (opts.shipping.sameAsBilling) {
      await clearDefaultShippingAddressTx(tx, { partyId: opts.partyId });
    } else {
      const shipping = toAddressInput(opts.shipping.shippingAddress);
      if (isAddressFilled(shipping)) {
        await upsertDefaultShippingAddressTx(tx, {
          businessId: opts.businessId,
          partyId: opts.partyId,
          address: shipping,
        });
      } else {
        // Toggle was OFF but no fields filled → treat as "same as billing"
        // for the moment; the row is cleared so we don't carry an empty
        // shipping address on documents.
        await clearDefaultShippingAddressTx(tx, { partyId: opts.partyId });
      }
    }
  }
}

/**
 * Normalise the opening-balance input: "0", empty, or null/undefined all
 * collapse to "no opening balance". Returns a typed shape with `amount`
 * guaranteed to be a positive decimal string when non-null.
 */
function normaliseOpeningBalance(
  input: OpeningBalanceInputZ | null | undefined,
): {
  amount: string;
  direction: OpeningBalanceInputZ["direction"];
  asOfDate: string | null;
} | null {
  if (!input) return null;
  const amount = input.amount.trim();
  if (!amount || Number(amount) === 0) return null;
  return {
    amount,
    direction: input.direction,
    asOfDate: input.asOfDate ?? null,
  };
}

/**
 * Apply the opening-balance slice of a party create/update payload.
 *
 * Semantics:
 *   - desired: NULL  + no existing row  → no-op
 *   - desired: NULL  + existing row     → DELETE existing (only if pre-activity)
 *   - desired: VALUE + no existing row  → INSERT new opening_balance row
 *   - desired: VALUE + existing equal   → no-op (idempotent)
 *   - desired: VALUE + existing diff    → DELETE + INSERT (only if pre-activity)
 *   - any change attempt while non-opening activity exists → ConflictError
 *
 * Why hard-delete on pre-activity edits (not a reversal pair): until any
 * other ledger row exists, the opening balance is effectively a draft
 * accounting decision. A reversal pair would leave two rows in the
 * statement view ("opening 5000" + "reversed −5000" + "opening 6000")
 * which is noisy and confusing for an unactivated party. Once activity
 * exists, we lock — at that point reversal is the right correction path,
 * and we'll add an "Adjust opening balance" journal voucher in V1.5.
 */
async function applyOpeningBalanceTx(
  tx: Tx,
  opts: {
    businessId: string;
    partyId: string;
    openingBalance: OpeningBalanceInputZ | null | undefined;
  },
): Promise<void> {
  const desired = normaliseOpeningBalance(opts.openingBalance);
  const existing = await getOpeningBalanceEntryForPartyTx(tx, opts.partyId);

  if (!desired && !existing) return;

  if (desired && existing) {
    const existingAmount = existing.debitAmount ?? existing.creditAmount;
    const existingDirection: OpeningBalanceInputZ["direction"] =
      existing.debitAmount != null ? "to_collect" : "to_pay";
    const sameAmount =
      existingAmount != null &&
      Number(existingAmount) === Number(desired.amount);
    const sameDirection = existingDirection === desired.direction;
    if (sameAmount && sameDirection) return;
  }

  const hasActivity = await hasNonOpeningActivityForPartyTx(tx, opts.partyId);
  if (hasActivity) {
    throw new ConflictError(
      "Cannot modify opening balance — this party already has invoices or payments. (Adjust via journal voucher in V1.5.)",
    );
  }

  if (existing) {
    await deleteLedgerEntryByIdTx(tx, existing.id);
  }
  if (desired) {
    const isDebit = desired.direction === "to_collect";
    await insertLedgerEntryTx(tx, {
      businessId: opts.businessId,
      voucherType: "opening_balance",
      entryDate: desired.asOfDate ?? new Date().toISOString().slice(0, 10),
      partyId: opts.partyId,
      debitAmount: isDebit ? desired.amount : null,
      creditAmount: isDebit ? null : desired.amount,
      narration: "Opening balance",
    });
  }
}

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

    await applyAddressesTx(tx, {
      businessId: input.businessId,
      partyId: row.id,
      billingAddress: input.billingAddress ?? undefined,
      shipping: input.shipping,
    });

    await applyOpeningBalanceTx(tx, {
      businessId: input.businessId,
      partyId: row.id,
      openingBalance: input.openingBalance,
    });

    const openingBalance = normaliseOpeningBalance(input.openingBalance);
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
        hasBillingAddress: input.billingAddress
          ? isAddressFilled(toAddressInput(input.billingAddress))
          : false,
        openingBalance: openingBalance
          ? { amount: openingBalance.amount, direction: openingBalance.direction }
          : null,
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

    // Strip address-shaped + opening-balance keys before passing the rest to
    // updatePartyTx — those don't live on the parties row.
    const { billingAddress, shipping, openingBalance, ...partyPatch } = input;

    const updated = await updatePartyTx(tx, partyId, partyPatch);

    await applyAddressesTx(tx, {
      businessId: existing.businessId,
      partyId,
      billingAddress,
      shipping,
    });

    // Only apply opening-balance changes when the caller actually included
    // the key (PATCH semantics: undefined = no intent to change).
    if (openingBalance !== undefined) {
      await applyOpeningBalanceTx(tx, {
        businessId: existing.businessId,
        partyId,
        openingBalance,
      });
    }

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
