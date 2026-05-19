/**
 * Payment repository — the only place Drizzle queries the `payments` table.
 * Every query scopes by `business_id` or `invoice_id`; no business rules here.
 *
 * The amount sum is computed in JS with decimal.js rather than SQL `SUM()` —
 * the money discipline keeps every rupee value a string end to end, and a
 * flat column select keeps the `numeric` strings intact (see the relational-
 * reads note in lib/repositories/invoices.ts).
 */
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import Decimal from "decimal.js";

import { db, type Tx } from "../db";
import { type NewPayment, type Payment, payments } from "../db/schema";

export async function insertPayment(
  tx: Tx,
  values: NewPayment,
): Promise<Payment> {
  const [row] = await tx.insert(payments).values(values).returning();
  if (!row) throw new Error("Insert payment returned no row");
  return row;
}

/** Non-deleted payments for an invoice, newest receipt first. */
export async function listPaymentsForInvoice(
  invoiceId: string,
): Promise<Payment[]> {
  return db
    .select()
    .from(payments)
    .where(
      and(eq(payments.invoiceId, invoiceId), isNull(payments.deletedAt)),
    )
    .orderBy(desc(payments.paidAt));
}

/**
 * Sum of non-deleted payment amounts for an invoice, as a 2-dp money string.
 * Call inside the record/delete transaction AFTER the mutating write and
 * AFTER locking the invoice row — the lock serialises concurrent payments so
 * this sum can't miss a row.
 */
export async function sumPaymentsForInvoice(
  tx: Tx,
  invoiceId: string,
): Promise<string> {
  const rows = await tx
    .select({ amount: payments.amount })
    .from(payments)
    .where(
      and(eq(payments.invoiceId, invoiceId), isNull(payments.deletedAt)),
    );
  return rows
    .reduce((acc, r) => acc.plus(r.amount), new Decimal(0))
    .toFixed(2);
}

/** A single payment by id, any state (incl. soft-deleted). Null if absent. */
export async function getPaymentById(
  tx: Tx,
  paymentId: string,
): Promise<Payment | null> {
  const [row] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId));
  return row ?? null;
}

/** Soft-delete a payment (sets `deleted_at`). The caller recomputes the
 *  invoice's amount-paid + status in the same transaction. */
export async function softDeletePayment(
  tx: Tx,
  paymentId: string,
): Promise<void> {
  await tx
    .update(payments)
    .set({ deletedAt: new Date() })
    .where(eq(payments.id, paymentId));
}
