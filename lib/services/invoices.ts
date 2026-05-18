/**
 * Invoice service — the business-rules layer for invoices.
 *
 * Lifecycle of one create call:
 *   1. Permission check (RBAC).
 *   2. Look up the seller (business) state for GST classification.
 *   3. Compute per-line + invoice-level GST math (lib/gst.ts).
 *   4. In one transaction:
 *        a. Validate customer / originalInvoice belong to this business.
 *        b. Insert the invoice (no number — drafts are unnumbered) + line items.
 *        c. Write an `invoice.create` audit-log entry.
 *
 * The invoice is created in `status='draft'` with `number = NULL`. The real
 * invoice number is assigned at finalise (`finalizeInvoice`), formatted as
 * `{prefix}/{FY}/{seq}` from the issue date the invoice carries at that
 * moment — so a draft moved across an FY boundary takes the new FY's series.
 *
 * Stock deduction also happens at finalise, not here — drafts don't reserve
 * stock (a deliberate V1 simplification).
 */
import "server-only";

import { db } from "../db";
import type {
  Invoice,
  InvoiceLineItem,
  NewInvoiceLineItem,
} from "../db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors";
import { financialYearDateRange } from "../fy";
import {
  classifyTax,
  computeInvoiceTotals,
  computeLineItem,
} from "../gst";
import { buildInvoiceNumber } from "../invoice-number";
import { requirePermission, roleHas } from "../rbac";
import { writeAuditEntry } from "../audit";
import type {
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from "../schemas/invoice";
import {
  countFinalizedInvoicesOfType,
  deleteLineItemsForInvoice,
  finalizeInvoiceRow,
  findCustomerInBusiness,
  findInvoiceInBusiness,
  getBusinessById,
  getInvoiceForUser,
  getInvoiceForUserTx,
  getInvoiceWithLineItems,
  insertInvoice,
  insertLineItems,
  listInvoicesForUser,
  lockBusinessRow,
  softDeleteInvoice,
  updateInvoiceHeader,
} from "../repositories/invoices";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreatedInvoice extends Invoice {
  lineItems: InvoiceLineItem[];
}

export async function createInvoice(
  input: CreateInvoiceInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<CreatedInvoice> {
  // 1. RBAC — `requirePermission` also enforces membership (V1 tenant isolation).
  await requirePermission(actorUserId, input.businessId, "invoice:create");

  // 2. Credit/debit notes must reference an original invoice.
  if (
    (input.type === "credit_note" || input.type === "debit_note") &&
    !input.originalInvoiceId
  ) {
    throw new ValidationError(
      `${input.type === "credit_note" ? "Credit" : "Debit"} notes require originalInvoiceId`,
    );
  }

  // 3. Run everything that touches the DB inside one transaction.
  return db.transaction(async (tx) => {
    // 3a. Resolve the seller business (for tax classification). No FOR UPDATE
    //     lock here — drafts don't carry a number, so there's nothing to
    //     serialise on. The lock moves to finalise, where numbering happens.
    const business = await getBusinessById(tx, input.businessId);
    if (!business) throw new NotFoundError("Business not found");

    // 3b. Verify cross-references before doing math, so a validation error
    //     short-circuits before any inserts.
    if (input.customerId) {
      const customer = await findCustomerInBusiness(
        tx,
        input.businessId,
        input.customerId,
      );
      if (!customer) throw new ValidationError("Customer not found in this business");
    }
    if (input.originalInvoiceId) {
      const original = await findInvoiceInBusiness(
        tx,
        input.businessId,
        input.originalInvoiceId,
      );
      if (!original) {
        throw new ValidationError("Original invoice not found in this business");
      }
    }

    // 3c. Determine the place of supply and the resulting tax class. If the
    //     caller didn't pass placeOfSupplyStateCode, classifyTax falls back
    //     to intrastate (the conservative default).
    const placeOfSupply = input.placeOfSupplyStateCode ?? null;
    const taxClass = classifyTax(business.stateCode, placeOfSupply);

    // 3d. Per-line GST math.
    const lineAmounts = input.lineItems.map((line) =>
      computeLineItem(
        {
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          gstRate: line.gstRate,
        },
        taxClass,
      ),
    );

    const linesForTotals = input.lineItems.map((line, i) => {
      const a = lineAmounts[i];
      if (!a) throw new Error("internal: lineAmounts misaligned");
      return { ...line, ...a };
    });
    const totals = computeInvoiceTotals(linesForTotals);

    // 3e. Insert the invoice header. `number` is NULL — drafts are unnumbered;
    //     the real number is stamped on at finalise from the then-current
    //     issue date. Postgres treats NULLs as distinct in the unique index,
    //     so multiple in-flight drafts coexist.
    const issueDate = input.issueDate ?? formatToday();
    const invoice = await insertInvoice(tx, {
      businessId: input.businessId,
      customerId: input.customerId ?? null,
      type: input.type,
      number: null,
      status: "draft",
      originalInvoiceId: input.originalInvoiceId ?? null,
      placeOfSupplyStateCode: placeOfSupply,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      taxAmount: totals.taxAmount,
      roundOff: totals.roundOff,
      total: totals.total,
      amountPaid: "0",
      notes: input.notes ?? null,
      issueDate,
      dueDate: input.dueDate ?? null,
      createdBy: actorUserId,
    });

    // 3f. Insert line items.
    const lineRows: NewInvoiceLineItem[] = input.lineItems.map((line, i) => {
      const a = lineAmounts[i];
      if (!a) throw new Error("internal: lineAmounts misaligned");
      return {
        businessId: input.businessId,
        invoiceId: invoice.id,
        productId: line.productId ?? null,
        description: line.description,
        hsnCode: line.hsnCode ?? null,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount ?? "0",
        gstRate: line.gstRate,
        taxableAmount: a.taxableAmount,
        cgstAmount: a.cgstAmount,
        sgstAmount: a.sgstAmount,
        igstAmount: a.igstAmount,
        amount: a.amount,
        sortOrder: i,
      };
    });
    await insertLineItems(tx, lineRows);

    // 3g. Audit. Inside the same tx — commits or rolls back together with
    //     everything above. Drafts have no number yet, so the entry records
    //     the draft's id + total instead.
    await writeAuditEntry(tx, {
      action: "invoice.create",
      businessId: input.businessId,
      actorUserId,
      entityType: "invoice",
      entityId: invoice.id,
      changes: {
        type: input.type,
        status: "draft",
        total: totals.total,
        lineItemCount: lineRows.length,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    // 3h. Final read — same tx, so the caller gets a guaranteed-consistent
    //     view of what was just persisted.
    const created = await getInvoiceWithLineItems(
      tx,
      input.businessId,
      invoice.id,
    );
    if (!created) throw new Error("internal: just-inserted invoice not found");
    return created;
  });
}

// ---- helpers ------------------------------------------------------------

function formatToday(): string {
  // YYYY-MM-DD in UTC. `date` columns are stored as calendar dates with no
  // timezone, so we just use today in whatever zone the server thinks it is.
  // For India this almost always matches IST since servers near IST/UTC.
  return new Date().toISOString().slice(0, 10);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * Read an invoice by id, scoped to the caller's businesses. Returns null if
 * the invoice doesn't exist OR the user isn't a member — same null for both
 * so we don't leak existence to non-members.
 */
export async function getInvoice(
  invoiceId: string,
  actorUserId: string,
): Promise<CreatedInvoice | null> {
  return getInvoiceForUser(actorUserId, invoiceId);
}

/** List invoices the caller can see, filterable by business and status. */
export { listInvoicesForUser };

/**
 * Update a draft invoice. Drafts ONLY — finalised invoices are immutable
 * (GST rule + audit integrity). Replaces all line items, recomputes the
 * full tax breakdown using the same lib/gst math the create flow uses,
 * writes an `invoice.update` audit entry. All four writes happen inside
 * a single transaction.
 */
export async function updateInvoice(
  invoiceId: string,
  input: UpdateInvoiceInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<CreatedInvoice> {
  return db.transaction(async (tx) => {
    // 1. Fetch + auth (membership) inside the tx.
    const existing = await getInvoiceForUserTx(tx, actorUserId, invoiceId);
    if (!existing) throw new NotFoundError("Invoice not found");

    // 2. Draft-only: finalised invoices can't be edited; corrections go
    //    through credit notes.
    if (existing.status !== "draft") {
      throw new ConflictError(
        `Only draft invoices can be edited (this one is ${existing.status}). ` +
          `Issue a credit note instead.`,
      );
    }

    // 3. Permission check (RBAC). Caller must have `invoice:edit` for this
    //    business; salesman/viewer roles get blocked here.
    const role = await requirePermission(
      actorUserId,
      existing.businessId,
      "invoice:edit",
    );
    // Belt-and-suspenders: explicit defensive check that role can edit.
    if (!roleHas(role, "invoice:edit")) {
      throw new ForbiddenError("Your role cannot edit invoices");
    }

    // 4. Recompute tax math against the (possibly new) place-of-supply.
    const business = await getBusinessById(tx, existing.businessId);
    if (!business) throw new Error("internal: invoice's business not found");

    const placeOfSupply =
      input.placeOfSupplyStateCode ?? existing.placeOfSupplyStateCode;
    const taxClass = classifyTax(business.stateCode, placeOfSupply);

    const lineAmounts = input.lineItems.map((line) =>
      computeLineItem(
        {
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          gstRate: line.gstRate,
        },
        taxClass,
      ),
    );
    const linesForTotals = input.lineItems.map((line, i) => {
      const a = lineAmounts[i];
      if (!a) throw new Error("internal: lineAmounts misaligned");
      return { ...line, ...a };
    });
    const totals = computeInvoiceTotals(linesForTotals);

    // 5. Replace line items atomically — delete all, insert fresh.
    await deleteLineItemsForInvoice(tx, invoiceId);
    const newLines = input.lineItems.map((line, i) => {
      const a = lineAmounts[i];
      if (!a) throw new Error("internal: lineAmounts misaligned");
      return {
        businessId: existing.businessId,
        invoiceId,
        productId: line.productId ?? null,
        description: line.description,
        hsnCode: line.hsnCode ?? null,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount ?? "0",
        gstRate: line.gstRate,
        taxableAmount: a.taxableAmount,
        cgstAmount: a.cgstAmount,
        sgstAmount: a.sgstAmount,
        igstAmount: a.igstAmount,
        amount: a.amount,
        sortOrder: i,
      };
    });
    await insertLineItems(tx, newLines);

    // 6. Update invoice header (editable fields only — number/type/status
    //    stay locked).
    await updateInvoiceHeader(tx, invoiceId, {
      placeOfSupplyStateCode: placeOfSupply,
      notes: input.notes ?? null,
      issueDate: input.issueDate ?? existing.issueDate,
      dueDate: input.dueDate ?? null,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      taxAmount: totals.taxAmount,
      roundOff: totals.roundOff,
      total: totals.total,
    });

    // 7. Audit — diff stays small (rows are JSONB).
    await writeAuditEntry(tx, {
      action: "invoice.update",
      businessId: existing.businessId,
      actorUserId,
      entityType: "invoice",
      entityId: invoiceId,
      changes: {
        before: {
          total: existing.total,
          lineItemCount: existing.lineItems.length,
        },
        after: { total: totals.total, lineItemCount: newLines.length },
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    // 8. Re-read, return.
    const updated = await getInvoiceWithLineItems(
      tx,
      existing.businessId,
      invoiceId,
    );
    if (!updated) throw new Error("internal: updated invoice not found");
    return updated;
  });
}

/**
 * Soft-delete a DRAFT invoice. Finalised invoices are never deletable — a
 * GST-issued document must stay on the books; reverse it with a credit note
 * instead. Soft delete (`deleted_at`) keeps the audit trail's entity
 * reference valid.
 */
export async function deleteInvoice(
  invoiceId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getInvoiceForUserTx(tx, actorUserId, invoiceId);
    if (!existing) throw new NotFoundError("Invoice not found");

    if (existing.status !== "draft") {
      throw new ConflictError(
        `Only draft invoices can be deleted (this one is ${existing.status}). ` +
          `Issue a credit note to reverse a finalised invoice.`,
      );
    }
    await requirePermission(actorUserId, existing.businessId, "invoice:delete");

    await softDeleteInvoice(tx, invoiceId);
    await writeAuditEntry(tx, {
      action: "invoice.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "invoice",
      entityId: invoiceId,
      changes: { number: existing.number, total: existing.total },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

/**
 * Finalise a DRAFT invoice — stamp on its issued number and flip status to
 * `sent`. After this the invoice is immutable (edit + delete are blocked).
 *
 * The invoice number is assigned HERE, not at create. It's built from the
 * issue date the draft carries at this moment — a draft created in one FY
 * and finalised in the next takes the new FY's series. The sequence counts
 * only finalised rows of this type in this FY, so the printed series is
 * gap-free even if a draft is abandoned.
 *
 * Concurrency: the business row is locked `FOR UPDATE` so two concurrent
 * finalises against the same business serialise — the second sees the first's
 * stamped row before counting. Unique-violation on (business_id, number) is
 * mapped to ConflictError as a belt-and-suspenders, but should not occur.
 *
 * For V1 this is a manual "mark as sent"; the WhatsApp send flow will drive
 * the same transition once that lands.
 */
export async function finalizeInvoice(
  invoiceId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<CreatedInvoice> {
  return db.transaction(async (tx) => {
    const existing = await getInvoiceForUserTx(tx, actorUserId, invoiceId);
    if (!existing) throw new NotFoundError("Invoice not found");

    if (existing.status !== "draft") {
      throw new ConflictError(`Invoice is already ${existing.status}.`);
    }
    await requirePermission(
      actorUserId,
      existing.businessId,
      "invoice:finalize",
    );

    // Lock the business row → serialises number assignment per business so
    // the FY sequence is gap-free under concurrent finalises.
    const business = await lockBusinessRow(tx, existing.businessId);
    if (!business) throw new Error("internal: invoice's business not found");

    const fyRange = financialYearDateRange(existing.issueDate);
    const finalizedSoFar = await countFinalizedInvoicesOfType(
      tx,
      existing.businessId,
      existing.type,
      fyRange,
    );
    const number = buildInvoiceNumber({
      type: existing.type,
      issueDate: existing.issueDate,
      sequence: finalizedSoFar + 1,
      customPrefix: business.invoiceNumberPrefix,
    });

    try {
      await finalizeInvoiceRow(tx, invoiceId, number);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          "That invoice number was just taken — please retry.",
        );
      }
      throw err;
    }

    await writeAuditEntry(tx, {
      action: "invoice.finalize",
      businessId: existing.businessId,
      actorUserId,
      entityType: "invoice",
      entityId: invoiceId,
      changes: { number, from: "draft", to: "sent" },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    const updated = await getInvoiceWithLineItems(
      tx,
      existing.businessId,
      invoiceId,
    );
    if (!updated) throw new Error("internal: finalised invoice not found");
    return updated;
  });
}

// Re-exported so route handlers can pull the type without going through
// the schemas folder.
export type { CreateInvoiceInput } from "../schemas/invoice";
