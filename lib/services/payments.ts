/**
 * Payment service — recording money received against an invoice, and the
 * invoice-status math that follows.
 *
 * The one invariant everything here protects:
 *
 *   invoices.amount_paid  ===  SUM(payments.amount WHERE deleted_at IS NULL)
 *
 * `amount_paid` is never set from a client value or incremented in place —
 * it is always recomputed from the payments rows, which are the single
 * source of truth for what has been paid. Status follows from the sum:
 *
 *   amount_paid >= total      → "paid"            (+ paid_at)
 *   0 < amount_paid < total   → "partially_paid"
 *   amount_paid == 0          → "sent"
 *
 * Concurrency: record + delete both lock the invoice row `FOR UPDATE`, so two
 * payments against the same invoice serialise and the re-sum can't lose a
 * row. Money stays a decimal.js string end to end.
 */
import "server-only";
import Decimal from "decimal.js";

import { db } from "../db";
import { writeAuditEntry } from "../audit";
import type { Invoice, Payment } from "../db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { getMembership, roleHas } from "../rbac";
import type { RecordPaymentInput } from "../schemas/payment";
import {
  applyPaymentState,
  getInvoiceForUser,
  getInvoiceForUserTx,
  lockInvoiceRow,
} from "../repositories/invoices";
import {
  getPaymentById,
  insertPayment,
  listPaymentsForInvoice,
  softDeletePayment,
  sumPaymentsForInvoice,
} from "../repositories/payments";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PaymentResult {
  payment: Payment | null;
  amountPaid: string;
  status: Invoice["status"];
}

/**
 * Derive an invoice's payment status from its total and amount-paid. Pure —
 * the single place the paid/partially-paid/sent rule is expressed.
 *
 * When the sum drops back to zero (every payment voided) the status returns
 * to `sent`: a finalised-but-unpaid invoice. `seen` / `overdue` are not
 * reconstructed — `seen` is re-derived from public-link views and `overdue`
 * from the due-date cron; neither exists yet, and `sent` is the safe floor.
 */
function deriveStatus(
  total: string,
  amountPaid: string,
): "sent" | "partially_paid" | "paid" {
  const paid = new Decimal(amountPaid);
  if (paid.lte(0)) return "sent";
  if (paid.gte(total)) return "paid";
  return "partially_paid";
}

/**
 * Record one payment against a finalised invoice. Inside a single
 * transaction: insert the payment, re-sum, recompute the invoice's
 * amount-paid + status, write the audit entry.
 */
export async function recordPayment(
  invoiceId: string,
  input: RecordPaymentInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PaymentResult> {
  return db.transaction(async (tx) => {
    // 1. Auth: visible to this user? (404 covers not-found AND not-a-member.)
    const found = await getInvoiceForUserTx(tx, actorUserId, invoiceId);
    if (!found) throw new NotFoundError("Invoice not found");

    // 2. Permission. Membership is already proven by step 1, so this can
    //    only fail on the role lacking `payment:record` — a clean 403.
    const membership = await getMembership(actorUserId, found.businessId);
    if (!membership || !roleHas(membership.role, "payment:record")) {
      throw new ForbiddenError("Your role cannot record payments");
    }

    // 3. Lock the invoice row — serialises concurrent payments so the
    //    re-sum below can't miss a row.
    const invoice = await lockInvoiceRow(tx, invoiceId);
    if (!invoice) throw new NotFoundError("Invoice not found");

    // 4. Drafts are not issued documents — they take no payments.
    if (invoice.status === "draft") {
      throw new ConflictError(
        "This invoice is still a draft. Finalise it before recording a payment.",
      );
    }

    // 5. Insert the payment row.
    const payment = await insertPayment(tx, {
      businessId: invoice.businessId,
      invoiceId,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      createdBy: actorUserId,
    });

    // 6. Recompute amount-paid + status from the payments rows.
    const amountPaid = await sumPaymentsForInvoice(tx, invoiceId);
    const status = deriveStatus(invoice.total, amountPaid);
    // Preserve the original paid_at if the invoice was already fully paid
    // (an extra/overpayment shouldn't reset when it first cleared).
    const paidAt =
      status === "paid" ? (invoice.paidAt ?? new Date()) : null;
    await applyPaymentState(tx, invoiceId, { amountPaid, status, paidAt });

    // 7. Audit.
    await writeAuditEntry(tx, {
      action: "payment.record",
      businessId: invoice.businessId,
      actorUserId,
      entityType: "payment",
      entityId: payment.id,
      changes: {
        invoiceId,
        amount: input.amount,
        method: input.method,
        amountPaid,
        invoiceStatus: status,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { payment, amountPaid, status };
  });
}

/**
 * Void a payment (soft delete) and recompute the invoice. Same transaction +
 * lock model as `recordPayment` — the re-sum after the soft delete gives the
 * corrected amount-paid, and the status follows.
 */
export async function deletePayment(
  paymentId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<PaymentResult> {
  return db.transaction(async (tx) => {
    const payment = await getPaymentById(tx, paymentId);
    // 404 for "doesn't exist" AND "already voided" — no resurrection.
    if (!payment || payment.deletedAt) {
      throw new NotFoundError("Payment not found");
    }

    // Membership first → 404 (no existence leak); then the permission → 403.
    const membership = await getMembership(actorUserId, payment.businessId);
    if (!membership) throw new NotFoundError("Payment not found");
    if (!roleHas(membership.role, "payment:delete")) {
      throw new ForbiddenError("Your role cannot delete payments");
    }

    const invoice = await lockInvoiceRow(tx, payment.invoiceId);
    if (!invoice) throw new NotFoundError("Invoice not found");

    await softDeletePayment(tx, paymentId);

    const amountPaid = await sumPaymentsForInvoice(tx, payment.invoiceId);
    const status = deriveStatus(invoice.total, amountPaid);
    const paidAt =
      status === "paid" ? (invoice.paidAt ?? new Date()) : null;
    await applyPaymentState(tx, payment.invoiceId, {
      amountPaid,
      status,
      paidAt,
    });

    await writeAuditEntry(tx, {
      action: "payment.delete",
      businessId: payment.businessId,
      actorUserId,
      entityType: "payment",
      entityId: paymentId,
      changes: {
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        amountPaid,
        invoiceStatus: status,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { payment: null, amountPaid, status };
  });
}

/**
 * The payments recorded against an invoice, newest first. Membership-scoped:
 * a NotFoundError if the invoice isn't visible to the caller.
 */
export async function listInvoicePayments(
  invoiceId: string,
  actorUserId: string,
): Promise<Payment[]> {
  const invoice = await getInvoiceForUser(actorUserId, invoiceId);
  if (!invoice) throw new NotFoundError("Invoice not found");
  return listPaymentsForInvoice(invoiceId);
}
