/**
 * payment_entries service — Payment In / Payment Out.
 *
 * Every recorded payment writes EXACTLY two ledger_entries rows in the
 * same transaction (a third for settlement discount, if any):
 *
 *   Payment In (Sales side — customer pays us):
 *     Party leg:  credit_amount = amount         (party owes less)
 *     Money leg:  debit_amount  = amount         (cash IN to chosen account)
 *
 *   Payment Out (Purchase side — we pay supplier):
 *     Party leg:  debit_amount  = amount         (we owe supplier less)
 *     Money leg:  credit_amount = amount         (cash OUT of chosen account)
 *
 *   Settlement discount (write-off on receivable/payable; no cash moves):
 *     Party leg:  credit_amount = discount       (for payment_in)
 *                 debit_amount  = discount       (for payment_out)
 *
 * After the ledger legs land, the service refreshes `documents.amount_received`
 * for every document this entry touched (sum of non-cancelled allocations)
 * and recomputes `documents.status` (unpaid / partial_paid / paid).
 *
 * Cancellation writes reversal ledger rows (voucher_type='reversal',
 * flipped sides) and re-recomputes the affected documents' amount_received
 * + status.
 */
import "server-only";
import Decimal from "decimal.js";

import { db, type Tx } from "../db";
import {
  type DocStatusValue,
  type PaymentEntry,
  type PaymentEntryAllocation,
  documents,
  ledgerEntries,
} from "../db/schema";
import { and, eq } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import {
  type CancelPaymentEntryInput,
  type CreatePaymentEntryInput,
} from "../schemas/payment-entry";
import { getDocumentForUserTx } from "../repositories/documents";
import {
  getMoneyAccountForUserTx,
} from "../repositories/money-accounts";
import { getPartyForUserTx } from "../repositories/parties";
import {
  getPaymentEntryForUserTx,
  insertAllocationsTx,
  insertPaymentEntryTx,
  listPaymentEntriesForUser,
  markPaymentCancelledTx,
  sumAllocationsForDocumentTx,
} from "../repositories/payment-entries";
import { insertLedgerEntryTx } from "../repositories/ledger-entries";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Compute documents.status from grand_total + amount_received. Pure helper.
 */
export function statusFromAmounts(
  grandTotal: string,
  amountReceived: string,
): DocStatusValue {
  const gt = new Decimal(grandTotal);
  const ar = new Decimal(amountReceived);
  if (gt.lte(0)) return "paid"; // edge case: zero-amount doc
  if (ar.gte(gt)) return "paid";
  if (ar.lte(0)) return "unpaid";
  return "partial_paid";
}

export async function recordPayment(
  input: CreatePaymentEntryInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PaymentEntry> {
  await requirePermission(actorUserId, input.businessId, "payment:record");

  // Sum of allocations must equal `amount` (settlement discount is separate).
  const allocSum = input.allocations.reduce(
    (acc, a) => acc.plus(a.allocatedAmount),
    new Decimal(0),
  );
  if (!allocSum.eq(input.amount)) {
    throw new ValidationError(
      `Allocations (₹${allocSum.toFixed(2)}) must equal payment amount (₹${new Decimal(input.amount).toFixed(2)})`,
    );
  }

  return db.transaction(async (tx) => {
    // Resolve party + account + (each document is finalised in this biz).
    const party = await getPartyForUserTx(tx, actorUserId, input.partyId);
    if (!party || party.businessId !== input.businessId) {
      throw new NotFoundError("Party not found");
    }
    const moneyAccount = await getMoneyAccountForUserTx(
      tx,
      actorUserId,
      input.moneyAccountId,
    );
    if (!moneyAccount || moneyAccount.businessId !== input.businessId) {
      throw new NotFoundError("Money account not found");
    }

    // Validate each referenced document: visible, in this biz, finalised
    // (status != draft, != cancelled), allocation within outstanding balance.
    for (const a of input.allocations) {
      const doc = await getDocumentForUserTx(tx, actorUserId, a.documentId);
      if (!doc || doc.businessId !== input.businessId) {
        throw new NotFoundError(`Document ${a.documentId} not found`);
      }
      if (doc.status === "draft") {
        throw new ConflictError(
          `Can't record payment on draft document ${doc.id}`,
        );
      }
      if (doc.status === "cancelled") {
        throw new ConflictError(
          `Can't record payment on cancelled document ${doc.id}`,
        );
      }
      const outstanding = new Decimal(doc.grandTotal).sub(doc.amountReceived);
      if (new Decimal(a.allocatedAmount).gt(outstanding)) {
        throw new ValidationError(
          `Allocation ₹${a.allocatedAmount} exceeds document outstanding ₹${outstanding.toFixed(2)}`,
        );
      }
    }

    // 1) Insert the payment_entry row itself.
    const entry = await insertPaymentEntryTx(tx, {
      businessId: input.businessId,
      entryType: input.entryType,
      entryDate: input.entryDate,
      partyId: input.partyId,
      moneyAccountId: input.moneyAccountId,
      amount: new Decimal(input.amount).toFixed(2),
      discountAmount: new Decimal(input.discountAmount ?? "0").toFixed(2),
      paymentMode: input.paymentMode,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      status: "recorded",
      createdBy: actorUserId,
    });

    // 2) Insert allocations.
    await insertAllocationsTx(
      tx,
      input.allocations.map((a) => ({
        businessId: input.businessId,
        paymentEntryId: entry.id,
        documentId: a.documentId,
        allocatedAmount: new Decimal(a.allocatedAmount).toFixed(2),
      })),
    );

    // 3) Two-leg ledger post (party + money_account) + optional discount leg.
    const isIn = input.entryType === "payment_in";
    const amountStr = new Decimal(input.amount).toFixed(2);

    // Party leg
    await insertLedgerEntryTx(tx, {
      businessId: input.businessId,
      voucherType: isIn ? "payment_in" : "payment_out",
      entryDate: input.entryDate,
      partyId: input.partyId,
      paymentEntryId: entry.id,
      debitAmount: isIn ? null : amountStr,
      creditAmount: isIn ? amountStr : null,
      narration: input.reference ?? null,
    });

    // Money account leg
    await insertLedgerEntryTx(tx, {
      businessId: input.businessId,
      voucherType: isIn ? "payment_in" : "payment_out",
      entryDate: input.entryDate,
      moneyAccountId: input.moneyAccountId,
      paymentEntryId: entry.id,
      debitAmount: isIn ? amountStr : null,
      creditAmount: isIn ? null : amountStr,
      narration: input.reference ?? null,
    });

    // Settlement discount: third party-side leg, NO cash leg.
    const discount = new Decimal(input.discountAmount ?? "0");
    if (discount.gt(0)) {
      await insertLedgerEntryTx(tx, {
        businessId: input.businessId,
        voucherType: "settlement_discount",
        entryDate: input.entryDate,
        partyId: input.partyId,
        paymentEntryId: entry.id,
        debitAmount: isIn ? null : discount.toFixed(2),
        creditAmount: isIn ? discount.toFixed(2) : null,
        narration: "Settlement discount",
      });
    }

    // 4) Refresh amount_received + status on every touched document.
    for (const a of input.allocations) {
      await refreshDocumentReceiptTx(tx, a.documentId);
    }

    await writeAuditEntry(tx, {
      action: isIn ? "payment.record" : "payment.record_out",
      businessId: input.businessId,
      actorUserId,
      entityType: "payment_entry",
      entityId: entry.id,
      changes: {
        amount: input.amount,
        discount: input.discountAmount ?? "0",
        allocations: input.allocations.length,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return entry;
  });
}

/**
 * Cancel a recorded payment. Writes reversal ledger entries for every
 * ledger row produced by the payment, then refreshes documents.
 */
export async function cancelPayment(
  paymentEntryId: string,
  input: CancelPaymentEntryInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PaymentEntry> {
  return db.transaction(async (tx) => {
    const entry = await getPaymentEntryForUserTx(tx, actorUserId, paymentEntryId);
    if (!entry) throw new NotFoundError("Payment not found");
    if (entry.status === "cancelled") {
      throw new ConflictError("Payment is already cancelled");
    }
    await requirePermission(actorUserId, entry.businessId, "payment:delete");

    // Find originals via paymentEntryId — write reversals.
    const originals = await tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.paymentEntryId, paymentEntryId));
    for (const orig of originals) {
      if (orig.reversedByLedgerEntryId) continue;
      const reversal = await insertLedgerEntryTx(tx, {
        businessId: entry.businessId,
        voucherType: "reversal",
        entryDate: entry.entryDate,
        partyId: orig.partyId ?? null,
        moneyAccountId: orig.moneyAccountId ?? null,
        paymentEntryId: paymentEntryId,
        debitAmount: orig.creditAmount ?? null,
        creditAmount: orig.debitAmount ?? null,
        narration: `Reversal of payment ${entry.id}`,
      });
      await tx
        .update(ledgerEntries)
        .set({ reversedByLedgerEntryId: reversal.id })
        .where(eq(ledgerEntries.id, orig.id));
    }

    const cancelled = await markPaymentCancelledTx(
      tx,
      paymentEntryId,
      input.reason ?? null,
    );

    // Re-derive amount_received + status on every doc this payment touched.
    const allocations = await tx
      .select()
      .from((await import("../db/schema")).paymentEntryAllocations)
      .where(
        eq(
          (await import("../db/schema")).paymentEntryAllocations.paymentEntryId,
          paymentEntryId,
        ),
      );
    for (const a of allocations) {
      await refreshDocumentReceiptTx(tx, a.documentId);
    }

    await writeAuditEntry(tx, {
      action: "payment.cancel",
      businessId: entry.businessId,
      actorUserId,
      entityType: "payment_entry",
      entityId: paymentEntryId,
      changes: { reason: input.reason ?? null },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return cancelled;
  });
}

/**
 * Recompute documents.amount_received from non-cancelled allocations + update
 * status. Idempotent — safe to re-run after any payment change.
 */
async function refreshDocumentReceiptTx(
  tx: Tx,
  documentId: string,
): Promise<void> {
  const received = await sumAllocationsForDocumentTx(tx, documentId);
  const [doc] = await tx
    .select({
      grandTotal: documents.grandTotal,
      currentStatus: documents.status,
    })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!doc) return;
  // Don't flip a cancelled doc's status — once cancelled, stays cancelled.
  const newStatus =
    doc.currentStatus === "cancelled"
      ? "cancelled"
      : statusFromAmounts(doc.grandTotal, received);
  await tx
    .update(documents)
    .set({ amountReceived: received, status: newStatus })
    .where(eq(documents.id, documentId));
}

export { listPaymentEntriesForUser };
