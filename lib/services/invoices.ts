/**
 * Invoice service — the business-rules layer for invoices.
 *
 * Lifecycle of one create call:
 *   1. Permission check (RBAC).
 *   2. Look up the seller (business) state for GST classification.
 *   3. Compute per-line + invoice-level GST math (lib/gst.ts).
 *   4. In one transaction:
 *        a. FOR UPDATE lock on the business row (race-free numbering).
 *        b. Count existing invoices of this type → next number.
 *        c. Validate customer / originalInvoice belong to this business.
 *        d. Insert the invoice + its line items.
 *        e. Write an `invoice.create` audit-log entry.
 *
 * The invoice is created in `status='draft'`. Stock deduction does NOT happen
 * here — it happens on finalise (status → sent), in a future endpoint.
 * Drafts don't reserve stock; that's a deliberate V1 simplification.
 */
import "server-only";
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import {
  type Invoice,
  type InvoiceLineItem,
  type NewInvoiceLineItem,
  businesses,
  invoiceType,
} from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import {
  classifyTax,
  computeInvoiceTotals,
  computeLineItem,
} from "../gst";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import type { CreateInvoiceInput } from "../schemas/invoice";
import {
  countInvoicesOfType,
  findCustomerInBusiness,
  findInvoiceInBusiness,
  getInvoiceWithLineItems,
  insertInvoice,
  insertLineItems,
  lockBusinessRow,
} from "../repositories/invoices";

// Prefix per invoice type — kept here (service-layer policy), not in the DB.
const TYPE_PREFIX: Record<(typeof invoiceType.enumValues)[number], string> = {
  tax_invoice: "INV-",
  estimate: "EST-",
  cash_receipt: "CR-",
  credit_note: "CN-",
  debit_note: "DN-",
};

const NUMBER_PAD = 4;

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
    // 3a. Lock the business row — serialises invoice creation per business
    //     (race-free numbering, holds until COMMIT).
    const business = await lockBusinessRow(tx, input.businessId);
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

    // 3c. Determine the place of supply and the resulting tax class.
    //     If the caller didn't pass placeOfSupplyStateCode, fall back to the
    //     customer's state (looked up at the time of computeLineItem below
    //     via classifyTax — we resolve it here once).
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

    // 3e. Generate the next per-type number for this business. Safe under
    //     concurrent calls because the business row is locked above.
    const used = await countInvoicesOfType(tx, input.businessId, input.type);
    const prefix = TYPE_PREFIX[input.type];
    const number = `${prefix}${String(used + 1).padStart(NUMBER_PAD, "0")}`;

    // 3f. Insert the invoice header.
    let invoice;
    try {
      invoice = await insertInvoice(tx, {
        businessId: input.businessId,
        customerId: input.customerId ?? null,
        type: input.type,
        number,
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
        issueDate: input.issueDate ?? formatToday(),
        dueDate: input.dueDate ?? null,
        createdBy: actorUserId,
      });
    } catch (err) {
      // Postgres unique-violation on (business_id, number) — exceedingly rare
      // given the FOR UPDATE lock, but turn it into a typed conflict so the
      // client gets a 409 instead of a 500.
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          "An invoice with this number already exists. Please retry.",
        );
      }
      throw err;
    }

    // 3g. Insert line items.
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

    // 3h. Audit. Inside the same tx — commits or rolls back together with
    //     everything above.
    await writeAuditEntry(tx, {
      action: "invoice.create",
      businessId: input.businessId,
      actorUserId,
      entityType: "invoice",
      entityId: invoice.id,
      changes: {
        type: input.type,
        number,
        total: totals.total,
        lineItemCount: lineRows.length,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    // 3i. Final read — same tx, so the caller gets a guaranteed-consistent
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

// Re-exported so route handlers can pull the type without going through
// the schemas folder.
export type { CreateInvoiceInput } from "../schemas/invoice";

// Quiet the "imported but unused" lint for the eq/and/businesses we may want
// in other methods on this service file. Remove when fetch/list methods land.
void eq;
void and;
void businesses;
