/**
 * documents service — the transactional spine of the books.
 *
 * Lifecycle:
 *   draft  → unpaid (finalise: assigns number + posts ledger + writes stock)
 *   unpaid → partial_paid → paid (driven by payment_entries; service in
 *     services/payment-entries.ts updates documents.amountReceived + status)
 *   unpaid → cancelled (cancel: writes reversal ledger + reversal stock)
 *   draft  → hard-delete (acceptable for unfinalised drafts only)
 *
 * Finalise posting matrix, by doc_type:
 *   sales_invoice    | party debit  | stock OUT (txn_type='sale')
 *   estimate         | —            | —
 *   delivery_challan | —            | stock OUT (txn_type='sale')
 *   credit_note      | party credit | stock IN  (txn_type='sales_return')
 *   purchase_invoice | party credit | stock IN  (txn_type='purchase')
 *   debit_note       | party debit  | stock OUT (txn_type='purchase_return')
 *   quotation        | —            | —
 *   proforma_invoice | —            | —
 *
 * Cancel writes reverse-direction entries: voucher_type='reversal' on the
 * ledger leg, marking the original entry's `reversed_by_ledger_entry_id`;
 * a balancing stock movement with txn_type='manual_adjustment' and the
 * negated qty (no perfectly-symmetric stock txn_type exists for arbitrary
 * reversals; the narration carries the cancelled-doc id for the audit
 * trail).
 *
 * Concurrency: the entire finalise / cancel happens in one transaction, so
 * the counter row lock, the doc row write, and the ledger / stock writes
 * commit atomically.
 */
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import Decimal from "decimal.js";

import { db, type Tx } from "../db";
import {
  type DocTypeValue,
  type Document,
  type DocumentAdditionalCharge,
  type DocumentLineItem,
  type NewDocumentAdditionalCharge,
  type NewDocumentLineItem,
  type StockTxnTypeValue,
  type VoucherTypeValue,
} from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { requirePermission } from "../rbac";
import { writeAuditEntry } from "../audit";
import {
  classifyTax,
  computeInvoiceTotals,
  computeLineItem,
  type ExtraChargeInput,
  type LineItemInput,
  type TaxClass,
} from "../gst";
import {
  type AdditionalChargeInputDto,
  type CancelDocumentInput,
  type CreateDocumentInput,
  type LineItemInputDto,
  type UpdateDocumentInput,
} from "../schemas/document";
import { getBusinessForUserTx } from "../repositories/businesses";
import {
  type DocumentPatch,
  deleteDocumentAdditionalChargesTx,
  deleteDocumentLineItemsTx,
  findDocumentWithLinesForUser,
  getDocumentForUser,
  getDocumentForUserTx,
  hardDeleteDocumentTx,
  insertDocumentAdditionalChargesTx,
  insertDocumentLineItemsTx,
  insertDocumentTx,
  listDocumentsForUser,
  markCancelledTx,
  markFinalisedTx,
  updateDocumentTx,
} from "../repositories/documents";
import { reserveNextNumberTx } from "./document-counters";
import {
  recordPaymentTx,
  validatePaymentInput,
} from "./payment-entries";
import {
  insertLedgerEntryTx,
} from "../repositories/ledger-entries";
import { ledgerEntries } from "../db/schema";
import { eq } from "drizzle-orm";
import { insertStockMovementWithLockTx } from "../repositories/stock-movements";
import { getPartyForUserTx } from "../repositories/parties";
import type { CreatePaymentEntryInput } from "../schemas/payment-entry";

// ─── Posting policy ────────────────────────────────────────────────────────

interface FinalisePosting {
  ledgerSide: "debit" | "credit" | null;
  /** The ledger voucherType to use when posting. Matches docType for the
   *  financial doc types. Always null when ledgerSide is null. */
  ledgerVoucherType: VoucherTypeValue | null;
  /** Direction of stock movement; null = no stock effect. */
  stockDirection: "in" | "out" | null;
  /** The stock_movements.txn_type to use. */
  stockTxnType: StockTxnTypeValue | null;
}

export const POSTING_POLICY: Record<DocTypeValue, FinalisePosting> = {
  sales_invoice: {
    ledgerSide: "debit",
    ledgerVoucherType: "sales_invoice",
    stockDirection: "out",
    stockTxnType: "sale",
  },
  estimate: {
    ledgerSide: null,
    ledgerVoucherType: null,
    stockDirection: null,
    stockTxnType: null,
  },
  delivery_challan: {
    // No ledger — DC isn't a financial document.
    ledgerSide: null,
    ledgerVoucherType: null,
    stockDirection: "out",
    stockTxnType: "sale",
  },
  credit_note: {
    ledgerSide: "credit",
    ledgerVoucherType: "credit_note",
    stockDirection: "in",
    stockTxnType: "sales_return",
  },
  purchase_invoice: {
    ledgerSide: "credit",
    ledgerVoucherType: "purchase_invoice",
    stockDirection: "in",
    stockTxnType: "purchase",
  },
  debit_note: {
    ledgerSide: "debit",
    ledgerVoucherType: "debit_note",
    stockDirection: "out",
    stockTxnType: "purchase_return",
  },
  quotation: {
    ledgerSide: null,
    ledgerVoucherType: null,
    stockDirection: null,
    stockTxnType: null,
  },
  proforma_invoice: {
    ledgerSide: null,
    ledgerVoucherType: null,
    stockDirection: null,
    stockTxnType: null,
  },
};

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface ComputedAmounts {
  // For each input line, computed monetary breakdown + persisted row payload.
  lines: Array<LineItemInputDto & ReturnType<typeof computeLineItem>>;
  taxClass: TaxClass;
  totals: ReturnType<typeof computeInvoiceTotals>;
}

/**
 * Run GST math + invoice totals over the user's submitted lines + extra
 * charges. Inclusive-tax pricing (priceIncludesTax = true) is back-calculated
 * to a pre-tax unitPrice for the math, then snapshotted on the line.
 */
function computeMonies(
  lines: LineItemInputDto[],
  additionalCharges: AdditionalChargeInputDto[] | undefined,
  taxClass: TaxClass,
): ComputedAmounts {
  const computedLines = lines.map((l) => {
    const gstRate = l.gstRate ?? "0";
    // Inclusive → back-calc the pre-tax unit price.
    const inclusive = Boolean(l.priceIncludesTax);
    const rate = new Decimal(gstRate);
    const preTaxUnit = inclusive
      ? new Decimal(l.pricePerUnit).div(
          new Decimal(1).plus(rate.div(100)),
        )
      : new Decimal(l.pricePerUnit);

    // Resolve line-level discount: percent OR absolute. Percent wins if set.
    const grossBeforeDiscount = preTaxUnit.times(l.quantity);
    let discountAmt = new Decimal(l.discountAmount ?? "0");
    if (l.discountPercent != null) {
      discountAmt = grossBeforeDiscount
        .times(l.discountPercent)
        .div(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const lineInput: LineItemInput = {
      quantity: l.quantity,
      unitPrice: preTaxUnit.toFixed(4), // higher precision for inclusive back-calc
      discountAmount: discountAmt.toFixed(2),
      gstRate,
    };
    const amounts = computeLineItem(lineInput, taxClass);
    return { ...l, ...amounts };
  });

  const charges: ExtraChargeInput[] = (additionalCharges ?? []).map((c) => ({
    amount: c.amount,
    taxable: c.taxable,
    gstRate: c.gstRate ?? null,
  }));

  const totals = computeInvoiceTotals(
    computedLines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.pricePerUnit,
      discountAmount: l.discountAmount,
      gstRate: l.gstRate ?? "0",
      taxableAmount: l.taxableAmount,
      cgstAmount: l.cgstAmount,
      sgstAmount: l.sgstAmount,
      igstAmount: l.igstAmount,
      amount: l.amount,
    })),
    { extraCharges: charges, taxClass },
  );

  return { lines: computedLines, taxClass, totals };
}

function totalsToDocumentPatch(
  totals: ReturnType<typeof computeInvoiceTotals>,
  billLevelDiscount: string,
): DocumentPatch {
  // Take grandTotal as totals.total − billLevelDiscount (already net of round-off).
  const grandTotal = new Decimal(totals.total)
    .sub(billLevelDiscount)
    .toFixed(2);

  // Recompute the line-discount-only piece by subtracting non-line discount
  // from the totals' "discountAmount" (which is the sum of per-line discounts).
  return {
    subtotal: totals.subtotal,
    totalLineDiscount: totals.discountAmount,
    additionalChargesTaxable: totals.extraChargesTaxable,
    additionalChargesNonTaxable: totals.extraChargesNonTaxable,
    taxableAmount: totals.taxableAmount,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    igstAmount: totals.igstAmount,
    totalTaxAmount: totals.taxAmount,
    billLevelDiscount,
    roundOff: totals.roundOff,
    grandTotal,
  };
}

function lineRowsForInsert(
  computed: ComputedAmounts["lines"],
  businessId: string,
  documentId: string,
): NewDocumentLineItem[] {
  return computed.map((l, idx) => ({
    businessId,
    documentId,
    lineNo: idx + 1,
    itemId: l.itemId ?? null,
    itemNameSnapshot: l.itemNameSnapshot,
    hsnSacCodeSnapshot: l.hsnSacCodeSnapshot ?? null,
    unitCodeSnapshot: l.unitCodeSnapshot ?? null,
    description: l.description ?? null,
    quantity: l.quantity,
    secondaryQuantity: l.secondaryQuantity ?? null,
    secondaryUnitCode: l.secondaryUnitCode ?? null,
    pricePerUnit: l.pricePerUnit,
    priceIncludesTax: l.priceIncludesTax ?? false,
    discountPercent: l.discountPercent ?? null,
    discountAmount: l.discountAmount,
    gstRate: l.gstRate ?? null,
    taxableAmount: l.taxableAmount,
    cgstAmount: l.cgstAmount,
    sgstAmount: l.sgstAmount,
    igstAmount: l.igstAmount,
    taxAmount: new Decimal(l.cgstAmount)
      .add(l.sgstAmount)
      .add(l.igstAmount)
      .toFixed(2),
    lineAmount: l.amount,
    sortOrder: idx,
  }));
}

function chargeRowsForInsert(
  charges: AdditionalChargeInputDto[] | undefined,
  businessId: string,
  documentId: string,
): NewDocumentAdditionalCharge[] {
  if (!charges) return [];
  return charges.map((c, idx) => ({
    businessId,
    documentId,
    label: c.label,
    amount: c.amount,
    taxable: c.taxable,
    gstRate: c.gstRate ?? null,
    sortOrder: idx,
  }));
}

// ─── Create / Update ───────────────────────────────────────────────────────

/** docTypes that accept an inline firstPayment at create. Sales invoice
 *  records a payment_in; purchase invoice records a payment_out. Other
 *  doc types (quotation, credit_note, etc.) reject firstPayment with a
 *  clear error — refunds and adjustments use the standalone payment flow. */
const FIRST_PAYMENT_TYPE: Record<string, "payment_in" | "payment_out" | undefined> =
  {
    sales_invoice: "payment_in",
    purchase_invoice: "payment_out",
  };

export async function createDocument(
  input: CreateDocumentInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Document> {
  await requirePermission(actorUserId, input.businessId, "document:create");

  // If a firstPayment is requested, validate the docType up front + ensure
  // the caller has payment:record permission. The actual atomic chain runs
  // inside the createDocument transaction.
  let firstPaymentEntryType: "payment_in" | "payment_out" | null = null;
  if (input.firstPayment) {
    firstPaymentEntryType = FIRST_PAYMENT_TYPE[input.docType] ?? null;
    if (!firstPaymentEntryType) {
      throw new ValidationError(
        `Inline first payment is not supported for ${input.docType} — use the payments flow after issuing the document.`,
      );
    }
    await requirePermission(actorUserId, input.businessId, "payment:record");
  }

  return db.transaction(async (tx) => {
    // Resolve party + state for tax classification.
    const party = await getPartyForUserTx(tx, actorUserId, input.partyId);
    if (!party || party.businessId !== input.businessId) {
      throw new NotFoundError("Party not found");
    }

    const businessAccess = await getBusinessForUserTx(
      tx,
      actorUserId,
      input.businessId,
    );
    if (!businessAccess) throw new NotFoundError("Business not found");
    const business = businessAccess.business;

    // Place of supply: explicit on input wins, otherwise infer from the party.
    // (Party-level state code is V1.5 — for V1 we let the caller pass it.)
    const taxClass = classifyTax(
      business.stateCode,
      input.placeOfSupplyStateCode,
    );

    const computed = computeMonies(
      input.lines,
      input.additionalCharges,
      taxClass,
    );
    const totalsPatch = totalsToDocumentPatch(
      computed.totals,
      input.billLevelDiscount ?? "0",
    );

    // Insert the shell row first so we have an id for the children.
    const document = await insertDocumentTx(tx, {
      businessId: input.businessId,
      docType: input.docType,
      docDate: input.docDate,
      partyId: input.partyId,
      shipToAddressId: input.shipToAddressId ?? null,
      sourceDocId: input.sourceDocId ?? null,
      originalDocNumber: input.originalDocNumber ?? null,
      originalDocDate: input.originalDocDate ?? null,
      paymentTermsDays: input.paymentTermsDays ?? null,
      dueDate: input.dueDate ?? null,
      placeOfSupplyStateCode: input.placeOfSupplyStateCode ?? null,
      signatureUrl: input.signatureUrl ?? null,
      termsConditions: input.termsConditions ?? null,
      notes: input.notes ?? null,
      autoRoundOffEnabled: input.autoRoundOffEnabled ?? false,
      transportMode: input.transportMode ?? null,
      vehicleNumber: input.vehicleNumber ?? null,
      ewayBillNumber: input.ewayBillNumber ?? null,
      ...totalsPatch,
      createdBy: actorUserId,
    });

    await insertDocumentLineItemsTx(
      tx,
      lineRowsForInsert(computed.lines, input.businessId, document.id),
    );
    if (input.additionalCharges?.length) {
      await insertDocumentAdditionalChargesTx(
        tx,
        chargeRowsForInsert(input.additionalCharges, input.businessId, document.id),
      );
    }

    await writeAuditEntry(tx, {
      action: "document.create",
      businessId: input.businessId,
      actorUserId,
      entityType: "document",
      entityId: document.id,
      changes: {
        docType: input.docType,
        partyId: input.partyId,
        grandTotal: totalsPatch.grandTotal,
        lineCount: computed.lines.length,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    // Atomic finalise + firstPayment chain. If anything in this block
    // throws, the whole transaction (incl. the doc insert above) rolls
    // back — caller sees nothing was created.
    if (input.firstPayment && firstPaymentEntryType) {
      const finalised = await finaliseDocumentTx(
        tx,
        document.id,
        actorUserId,
        ctx,
      );
      const amount = new Decimal(input.firstPayment.amount);
      const grandTotal = new Decimal(finalised.grandTotal);
      if (amount.gt(grandTotal)) {
        throw new ValidationError(
          `First payment ₹${amount.toFixed(2)} exceeds grand total ₹${grandTotal.toFixed(2)}.`,
        );
      }
      const paymentInput: CreatePaymentEntryInput = {
        businessId: input.businessId,
        entryType: firstPaymentEntryType,
        entryDate: input.docDate,
        partyId: input.partyId,
        moneyAccountId: input.firstPayment.moneyAccountId,
        amount: amount.toFixed(2),
        paymentMode: input.firstPayment.paymentMode,
        allocations: [
          {
            documentId: finalised.id,
            allocatedAmount: amount.toFixed(2),
          },
        ],
      };
      validatePaymentInput(paymentInput);
      await recordPaymentTx(tx, paymentInput, actorUserId, ctx);
      return finalised;
    }

    return document;
  });
}

export async function updateDocument(
  documentId: string,
  input: UpdateDocumentInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Document> {
  return db.transaction(async (tx) => {
    const existing = await getDocumentForUserTx(tx, actorUserId, documentId);
    if (!existing) throw new NotFoundError("Document not found");
    if (existing.status !== "draft") {
      throw new ConflictError(
        "Only draft documents can be edited. Finalised docs must be cancelled.",
      );
    }
    await requirePermission(actorUserId, existing.businessId, "document:create");

    // If lines / charges are provided, replace them wholesale + recompute.
    // Otherwise only patch metadata fields.
    let totalsPatch: DocumentPatch = {};

    if (input.lines !== undefined) {
      const businessAccess = await getBusinessForUserTx(
        tx,
        actorUserId,
        existing.businessId,
      );
      if (!businessAccess) throw new NotFoundError("Business not found");
      const stateCode =
        input.placeOfSupplyStateCode ?? existing.placeOfSupplyStateCode;
      const taxClass = classifyTax(businessAccess.business.stateCode, stateCode);

      const computed = computeMonies(
        input.lines,
        input.additionalCharges,
        taxClass,
      );
      totalsPatch = totalsToDocumentPatch(
        computed.totals,
        input.billLevelDiscount ?? existing.billLevelDiscount,
      );

      await deleteDocumentLineItemsTx(tx, documentId);
      await deleteDocumentAdditionalChargesTx(tx, documentId);
      await insertDocumentLineItemsTx(
        tx,
        lineRowsForInsert(computed.lines, existing.businessId, documentId),
      );
      if (input.additionalCharges?.length) {
        await insertDocumentAdditionalChargesTx(
          tx,
          chargeRowsForInsert(
            input.additionalCharges,
            existing.businessId,
            documentId,
          ),
        );
      }
    }

    const patch: DocumentPatch = {
      ...totalsPatch,
    };
    // Non-line metadata
    const keys = [
      "docDate",
      "partyId",
      "shipToAddressId",
      "sourceDocId",
      "originalDocNumber",
      "originalDocDate",
      "paymentTermsDays",
      "dueDate",
      "placeOfSupplyStateCode",
      "signatureUrl",
      "termsConditions",
      "notes",
      "autoRoundOffEnabled",
      "transportMode",
      "vehicleNumber",
      "ewayBillNumber",
    ] as const;
    for (const k of keys) {
      if (input[k] !== undefined) {
        (patch as Record<string, unknown>)[k] = input[k];
      }
    }
    if (input.billLevelDiscount !== undefined && !totalsPatch.billLevelDiscount) {
      patch.billLevelDiscount = input.billLevelDiscount;
    }

    const updated = await updateDocumentTx(tx, documentId, patch);

    await writeAuditEntry(tx, {
      action: "document.update",
      businessId: existing.businessId,
      actorUserId,
      entityType: "document",
      entityId: documentId,
      changes: { fieldsChanged: Object.keys(input) },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}

// ─── Finalise ──────────────────────────────────────────────────────────────

/**
 * Generate a 16-char URL-safe share token. Stamped on at finalise so the
 * `/i/[shareToken]` public page can render the doc.
 */
function newShareToken(): string {
  return randomBytes(12).toString("base64url");
}

export async function finaliseDocument(
  documentId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Document> {
  return db.transaction((tx) =>
    finaliseDocumentTx(tx, documentId, actorUserId, ctx),
  );
}

/**
 * Inner finalise body — runs inside a caller-owned transaction so the doc
 * can be finalised + a first payment recorded atomically. Public wrapper
 * `finaliseDocument` opens its own tx and delegates here.
 */
export async function finaliseDocumentTx(
  tx: Tx,
  documentId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Document> {
  const existing = await getDocumentForUserTx(tx, actorUserId, documentId);
  if (!existing) throw new NotFoundError("Document not found");
  if (existing.status !== "draft") {
    throw new ConflictError(
      `Document is already ${existing.status}; finalise applies to drafts only`,
    );
  }
  await requirePermission(
    actorUserId,
    existing.businessId,
    "document:finalize",
  );

  const businessAccess = await getBusinessForUserTx(
    tx,
    actorUserId,
    existing.businessId,
  );
  if (!businessAccess) throw new NotFoundError("Business not found");
  const business = businessAccess.business;

  // 1) Reserve the next document number (per-FY counter, FOR UPDATE lock).
  const { number } = await reserveNextNumberTx(tx, {
    businessId: existing.businessId,
    docType: existing.docType,
    docDate: existing.docDate,
    fyStartMonth: business.fyStartMonth,
  });

  // 2) Update the doc row with number + token + status.
  const finalised = await markFinalisedTx(tx, documentId, {
    docNumber: number,
    shareToken: newShareToken(),
    finalisedAt: new Date(),
  });

  const policy = POSTING_POLICY[existing.docType];

  // 3) Post ledger leg if the doc_type has one.
  if (policy.ledgerSide && policy.ledgerVoucherType) {
    const amount = existing.grandTotal;
    if (new Decimal(amount).gt(0)) {
      await insertLedgerEntryTx(tx, {
        businessId: existing.businessId,
        voucherType: policy.ledgerVoucherType,
        entryDate: existing.docDate,
        partyId: existing.partyId,
        documentId: existing.id,
        debitAmount: policy.ledgerSide === "debit" ? amount : null,
        creditAmount: policy.ledgerSide === "credit" ? amount : null,
        narration: `${prettyDocType(existing.docType)} ${number}`,
      });
    }
  }

  // 4) Write stock movements for items on this doc, if the policy says so.
  if (policy.stockDirection && policy.stockTxnType) {
    const lines = await tx
      .select()
      .from((await import("../db/schema")).documentLineItems)
      .where(
        eq(
          (await import("../db/schema")).documentLineItems.documentId,
          existing.id,
        ),
      );
    const directionSign = policy.stockDirection === "in" ? 1 : -1;
    for (const line of lines) {
      if (!line.itemId) continue; // free-text line, no stock movement
      const qty = new Decimal(line.quantity).times(directionSign);
      if (qty.eq(0)) continue;
      await insertStockMovementWithLockTx(tx, {
        businessId: existing.businessId,
        itemId: line.itemId,
        txnType: policy.stockTxnType,
        qty: qty.toFixed(3),
        txnDate: existing.docDate,
        relatedDocId: existing.id,
        relatedPartyId: existing.partyId,
        createdBy: actorUserId,
        notes: `${prettyDocType(existing.docType)} ${number}`,
      });
    }
  }

  await writeAuditEntry(tx, {
    action: "document.finalize",
    businessId: existing.businessId,
    actorUserId,
    entityType: "document",
    entityId: existing.id,
    changes: { docNumber: number, docType: existing.docType },
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return finalised;
}

// ─── Cancel ────────────────────────────────────────────────────────────────

/**
 * Cancel a finalised document — never deletes. Writes inverse ledger entries
 * with voucherType='reversal' and links them via `reversed_by_ledger_entry_id`;
 * writes negated stock movements with txn_type='manual_adjustment' since the
 * stock_txn_type enum doesn't have a generic reversal value.
 *
 * Idempotency: a doc that's already cancelled fails with a 409. A doc with
 * recorded payments fails too — caller must void payments first.
 */
export async function cancelDocument(
  documentId: string,
  input: CancelDocumentInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Document> {
  return db.transaction(async (tx) => {
    const existing = await getDocumentForUserTx(tx, actorUserId, documentId);
    if (!existing) throw new NotFoundError("Document not found");
    if (existing.status === "cancelled") {
      throw new ConflictError("Document is already cancelled");
    }
    if (existing.status === "draft") {
      throw new ConflictError(
        "Drafts aren't cancelled — delete them instead",
      );
    }
    if (new Decimal(existing.amountReceived).gt(0)) {
      throw new ConflictError(
        "Void recorded payments before cancelling this document",
      );
    }
    await requirePermission(actorUserId, existing.businessId, "document:cancel");

    const policy = POSTING_POLICY[existing.docType];

    // 1) Reverse ledger leg(s) attached to this document.
    if (policy.ledgerSide) {
      const originals = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.documentId, existing.id));
      for (const orig of originals) {
        if (orig.reversedByLedgerEntryId) continue; // already reversed
        const reversal = await insertLedgerEntryTx(tx, {
          businessId: existing.businessId,
          voucherType: "reversal",
          entryDate: existing.docDate,
          partyId: orig.partyId ?? null,
          moneyAccountId: orig.moneyAccountId ?? null,
          documentId: existing.id,
          // Flip side: debit ↔ credit.
          debitAmount: orig.creditAmount ?? null,
          creditAmount: orig.debitAmount ?? null,
          narration: `Reversal of ${prettyDocType(existing.docType)} ${
            existing.docNumber ?? existing.id
          }`,
        });
        await tx
          .update(ledgerEntries)
          .set({ reversedByLedgerEntryId: reversal.id })
          .where(eq(ledgerEntries.id, orig.id));
      }
    }

    // 2) Reverse stock movements.
    if (policy.stockDirection) {
      const docLineItemsTable = (await import("../db/schema")).documentLineItems;
      const lines = await tx
        .select()
        .from(docLineItemsTable)
        .where(eq(docLineItemsTable.documentId, existing.id));
      for (const line of lines) {
        if (!line.itemId) continue;
        const directionSign = policy.stockDirection === "in" ? 1 : -1;
        const reverseQty = new Decimal(line.quantity)
          .times(directionSign)
          .negated();
        if (reverseQty.eq(0)) continue;
        await insertStockMovementWithLockTx(tx, {
          businessId: existing.businessId,
          itemId: line.itemId,
          // No dedicated reversal txn_type — manual_adjustment + narration.
          txnType: "manual_adjustment",
          qty: reverseQty.toFixed(3),
          txnDate: existing.docDate,
          relatedDocId: existing.id,
          relatedPartyId: existing.partyId,
          createdBy: actorUserId,
          notes: `Reversal of ${prettyDocType(existing.docType)} ${
            existing.docNumber ?? existing.id
          }`,
        });
      }
    }

    // 3) Flip the doc status.
    const cancelled = await markCancelledTx(tx, documentId, input.reason ?? null);

    await writeAuditEntry(tx, {
      action: "document.cancel",
      businessId: existing.businessId,
      actorUserId,
      entityType: "document",
      entityId: existing.id,
      changes: { reason: input.reason ?? null },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return cancelled;
  });
}

// ─── Delete (draft-only) ───────────────────────────────────────────────────

export async function deleteDraftDocument(
  documentId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<void> {
  return db.transaction(async (tx) => {
    const existing = await getDocumentForUserTx(tx, actorUserId, documentId);
    if (!existing) throw new NotFoundError("Document not found");
    if (existing.status !== "draft") {
      throw new ConflictError(
        "Only drafts can be deleted; finalised documents are cancelled",
      );
    }
    await requirePermission(actorUserId, existing.businessId, "document:delete");

    await hardDeleteDocumentTx(tx, documentId);

    await writeAuditEntry(tx, {
      action: "document.delete",
      businessId: existing.businessId,
      actorUserId,
      entityType: "document",
      entityId: documentId,
      changes: { docType: existing.docType },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  });
}

// ─── Reads ─────────────────────────────────────────────────────────────────

export async function getDocument(
  documentId: string,
  actorUserId: string,
): Promise<Document | null> {
  return getDocumentForUser(actorUserId, documentId);
}

export interface DocumentDetail {
  document: Document;
  lines: DocumentLineItem[];
  charges: DocumentAdditionalCharge[];
}

export async function getDocumentDetail(
  documentId: string,
  actorUserId: string,
): Promise<DocumentDetail | null> {
  return findDocumentWithLinesForUser(actorUserId, documentId);
}

export { listDocumentsForUser };

// ─── Convert flows ────────────────────────────────────────────────────────

/**
 * Convert a finalised quotation into a draft sales_invoice.
 *
 * Copies every line item + additional charge by value (snapshots preserved
 * on both sides), wires `source_doc_id` on the new invoice so the lineage
 * is queryable later. Returns the new draft for the user to review +
 * finalise.
 *
 * Quotations don't post any ledger or stock — converting doesn't touch
 * those either; the new sales_invoice will post when the user finalises it.
 */
export async function convertQuotationToInvoice(
  quotationId: string,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Document> {
  return db.transaction(async (tx) => {
    const quotation = await getDocumentForUserTx(tx, actorUserId, quotationId);
    if (!quotation) throw new NotFoundError("Quotation not found");
    if (quotation.docType !== "quotation") {
      throw new ValidationError("Only quotations can be converted to invoices");
    }
    if (quotation.status === "draft") {
      throw new ConflictError("Finalise the quotation first, then convert");
    }
    if (quotation.status === "cancelled") {
      throw new ConflictError("Can't convert a cancelled quotation");
    }
    await requirePermission(
      actorUserId,
      quotation.businessId,
      "document:create",
    );

    // Pull the quotation's line items + charges to copy.
    const { documentLineItems, documentAdditionalCharges } = await import(
      "../db/schema"
    );
    const [lines, charges] = await Promise.all([
      tx
        .select()
        .from(documentLineItems)
        .where(eq(documentLineItems.documentId, quotation.id))
        .orderBy(documentLineItems.sortOrder),
      tx
        .select()
        .from(documentAdditionalCharges)
        .where(eq(documentAdditionalCharges.documentId, quotation.id))
        .orderBy(documentAdditionalCharges.sortOrder),
    ]);

    // Create the new sales_invoice as a draft, source-linked back.
    const invoice = await insertDocumentTx(tx, {
      businessId: quotation.businessId,
      docType: "sales_invoice",
      docDate: new Date().toISOString().slice(0, 10),
      partyId: quotation.partyId,
      shipToAddressId: quotation.shipToAddressId,
      sourceDocId: quotation.id,
      paymentTermsDays: quotation.paymentTermsDays,
      placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
      termsConditions: quotation.termsConditions,
      notes: quotation.notes,
      autoRoundOffEnabled: quotation.autoRoundOffEnabled,
      subtotal: quotation.subtotal,
      totalLineDiscount: quotation.totalLineDiscount,
      additionalChargesTaxable: quotation.additionalChargesTaxable,
      additionalChargesNonTaxable: quotation.additionalChargesNonTaxable,
      taxableAmount: quotation.taxableAmount,
      cgstAmount: quotation.cgstAmount,
      sgstAmount: quotation.sgstAmount,
      igstAmount: quotation.igstAmount,
      totalTaxAmount: quotation.totalTaxAmount,
      billLevelDiscount: quotation.billLevelDiscount,
      roundOff: quotation.roundOff,
      grandTotal: quotation.grandTotal,
      createdBy: actorUserId,
    });

    await insertDocumentLineItemsTx(
      tx,
      lines.map((l, idx) => ({
        businessId: invoice.businessId,
        documentId: invoice.id,
        lineNo: idx + 1,
        itemId: l.itemId,
        itemNameSnapshot: l.itemNameSnapshot,
        hsnSacCodeSnapshot: l.hsnSacCodeSnapshot,
        unitCodeSnapshot: l.unitCodeSnapshot,
        description: l.description,
        quantity: l.quantity,
        secondaryQuantity: l.secondaryQuantity,
        secondaryUnitCode: l.secondaryUnitCode,
        pricePerUnit: l.pricePerUnit,
        priceIncludesTax: l.priceIncludesTax,
        discountPercent: l.discountPercent,
        discountAmount: l.discountAmount,
        gstRate: l.gstRate,
        taxableAmount: l.taxableAmount,
        cgstAmount: l.cgstAmount,
        sgstAmount: l.sgstAmount,
        igstAmount: l.igstAmount,
        taxAmount: l.taxAmount,
        lineAmount: l.lineAmount,
        sortOrder: l.sortOrder,
      })),
    );
    if (charges.length > 0) {
      await insertDocumentAdditionalChargesTx(
        tx,
        charges.map((c) => ({
          businessId: invoice.businessId,
          documentId: invoice.id,
          label: c.label,
          amount: c.amount,
          taxable: c.taxable,
          gstRate: c.gstRate,
          sortOrder: c.sortOrder,
        })),
      );
    }

    await writeAuditEntry(tx, {
      action: "document.convert",
      businessId: quotation.businessId,
      actorUserId,
      entityType: "document",
      entityId: invoice.id,
      changes: {
        from: { id: quotation.id, docType: quotation.docType },
        to: { id: invoice.id, docType: invoice.docType },
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return invoice;
  });
}

function prettyDocType(docType: DocTypeValue): string {
  return docType.replace(/_/g, " ");
}

// `errors.ts` exports ConflictError — re-export not needed but the import is.
// (Trivial to silence the linter; keeping the import explicit at module top.)
