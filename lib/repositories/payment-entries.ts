/**
 * payment_entries repository — Payment In / Payment Out. Every entry has at
 * least one row in `payment_entry_allocations` pointing at the document(s)
 * it settles.
 */
import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type NewPaymentEntry,
  type NewPaymentEntryAllocation,
  type PaymentEntry,
  type PaymentEntryAllocation,
  businessMembers,
  paymentEntries,
  paymentEntryAllocations,
} from "../db/schema";

export async function insertPaymentEntryTx(
  tx: Tx,
  values: NewPaymentEntry,
): Promise<PaymentEntry> {
  const [row] = await tx.insert(paymentEntries).values(values).returning();
  if (!row) throw new Error("Insert payment_entry returned no row");
  return row;
}

export async function insertAllocationsTx(
  tx: Tx,
  rows: NewPaymentEntryAllocation[],
): Promise<PaymentEntryAllocation[]> {
  if (rows.length === 0) return [];
  return tx.insert(paymentEntryAllocations).values(rows).returning();
}

export async function getPaymentEntryForUserTx(
  tx: Tx,
  userId: string,
  entryId: string,
): Promise<PaymentEntry | null> {
  const [entry] = await tx
    .select()
    .from(paymentEntries)
    .where(and(eq(paymentEntries.id, entryId), isNull(paymentEntries.deletedAt)));
  if (!entry) return null;
  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, entry.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? entry : null;
}

/**
 * For a given document: sum of non-cancelled payment_entry_allocations.
 * This is the SSOT for documents.amount_received — the service recomputes
 * it after every payment record/cancel.
 */
export async function sumAllocationsForDocumentTx(
  tx: Tx,
  documentId: string,
): Promise<string> {
  const [row] = await tx
    .select({
      total: sql<string>`coalesce(sum(${paymentEntryAllocations.allocatedAmount}), 0)::text`,
    })
    .from(paymentEntryAllocations)
    .innerJoin(
      paymentEntries,
      eq(paymentEntries.id, paymentEntryAllocations.paymentEntryId),
    )
    .where(
      and(
        eq(paymentEntryAllocations.documentId, documentId),
        eq(paymentEntries.status, "recorded"),
        isNull(paymentEntries.deletedAt),
      ),
    );
  return row?.total ?? "0";
}

/** Mark a payment_entry cancelled; allocations are left untouched (audit). */
export async function markPaymentCancelledTx(
  tx: Tx,
  entryId: string,
  reason: string | null,
): Promise<PaymentEntry> {
  const [row] = await tx
    .update(paymentEntries)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledReason: reason,
    })
    .where(eq(paymentEntries.id, entryId))
    .returning();
  if (!row) throw new Error("markPaymentCancelledTx returned no row");
  return row;
}

export async function listPaymentEntriesForUser(opts: {
  userId: string;
  businessId?: string;
  partyId?: string;
  limit?: number;
}): Promise<PaymentEntry[]> {
  const memberBusinessIds = db
    .select({ id: businessMembers.businessId })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.userId, opts.userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  const where = [
    inArray(paymentEntries.businessId, memberBusinessIds),
    isNull(paymentEntries.deletedAt),
  ];
  if (opts.businessId) where.push(eq(paymentEntries.businessId, opts.businessId));
  if (opts.partyId) where.push(eq(paymentEntries.partyId, opts.partyId));
  return db
    .select()
    .from(paymentEntries)
    .where(and(...where))
    .orderBy(desc(paymentEntries.entryDate), desc(paymentEntries.createdAt))
    .limit(opts.limit ?? 200);
}

/**
 * Sum of money received this period — SUM(amount) over recorded (non-
 * cancelled, non-deleted) payment_in entries with entry_date >= since.
 * `since` is a YYYY-MM-DD string. Powers the dashboard "paid this month" KPI.
 *
 * Note: `entryDate` is a `date` column; the boundary is whole-day, IST-implicit
 * (the small overlap with the UTC day is an accepted V1 imprecision).
 */
export async function sumPaymentsInForBusinessSince(
  businessId: string,
  since: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${paymentEntries.amount}), 0)::text`,
    })
    .from(paymentEntries)
    .where(
      and(
        eq(paymentEntries.businessId, businessId),
        eq(paymentEntries.entryType, "payment_in"),
        eq(paymentEntries.status, "recorded"),
        isNull(paymentEntries.deletedAt),
        gte(paymentEntries.entryDate, since),
      ),
    );
  return row?.total ?? "0";
}

/**
 * List the payment_entry rows that touch one specific document — driven via
 * the allocations join. Used by the doc detail page to render the Payment
 * History accordion.
 */
export async function listPaymentEntriesForDocument(
  documentId: string,
): Promise<
  Array<{
    entry: PaymentEntry;
    allocation: PaymentEntryAllocation;
  }>
> {
  const rows = await db
    .select({
      entry: paymentEntries,
      allocation: paymentEntryAllocations,
    })
    .from(paymentEntryAllocations)
    .innerJoin(
      paymentEntries,
      eq(paymentEntries.id, paymentEntryAllocations.paymentEntryId),
    )
    .where(eq(paymentEntryAllocations.documentId, documentId))
    .orderBy(desc(paymentEntries.entryDate));
  return rows;
}
