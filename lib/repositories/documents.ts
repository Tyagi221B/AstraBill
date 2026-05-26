/**
 * documents repository — replaces `invoices` going forward. Tenant-scoped,
 * soft-delete-aware (drafts can be hard-deleted by callers; finalised docs
 * are cancelled, never deleted).
 *
 * Line items and additional charges live in sibling tables. Reads typically
 * pull the document + its lines + its charges in one round-trip via the
 * `findDocumentWithLinesForUser` helper.
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type Document,
  type DocumentAdditionalCharge,
  type DocumentLineItem,
  type NewDocument,
  type NewDocumentAdditionalCharge,
  type NewDocumentLineItem,
  businessMembers,
  documentAdditionalCharges,
  documentLineItems,
  documents,
  parties,
} from "../db/schema";

export async function insertDocumentTx(
  tx: Tx,
  values: NewDocument,
): Promise<Document> {
  const [row] = await tx.insert(documents).values(values).returning();
  if (!row) throw new Error("Insert document returned no row");
  return row;
}

export async function insertDocumentLineItemsTx(
  tx: Tx,
  rows: NewDocumentLineItem[],
): Promise<DocumentLineItem[]> {
  if (rows.length === 0) return [];
  return tx.insert(documentLineItems).values(rows).returning();
}

export async function insertDocumentAdditionalChargesTx(
  tx: Tx,
  rows: NewDocumentAdditionalCharge[],
): Promise<DocumentAdditionalCharge[]> {
  if (rows.length === 0) return [];
  return tx.insert(documentAdditionalCharges).values(rows).returning();
}

export async function deleteDocumentLineItemsTx(
  tx: Tx,
  documentId: string,
): Promise<void> {
  await tx
    .delete(documentLineItems)
    .where(eq(documentLineItems.documentId, documentId));
}

export async function deleteDocumentAdditionalChargesTx(
  tx: Tx,
  documentId: string,
): Promise<void> {
  await tx
    .delete(documentAdditionalCharges)
    .where(eq(documentAdditionalCharges.documentId, documentId));
}

export async function getDocumentForUser(
  userId: string,
  documentId: string,
): Promise<Document | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));
  if (!doc) return null;

  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, doc.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? doc : null;
}

export async function getDocumentForUserTx(
  tx: Tx,
  userId: string,
  documentId: string,
): Promise<Document | null> {
  const [doc] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));
  if (!doc) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, doc.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  return member ? doc : null;
}

/**
 * Document + lines + charges in one go — what the detail/preview pages need.
 * Returns null if the doc isn't visible to the caller.
 */
export async function findDocumentWithLinesForUser(
  userId: string,
  documentId: string,
): Promise<{
  document: Document;
  lines: DocumentLineItem[];
  charges: DocumentAdditionalCharge[];
} | null> {
  const document = await getDocumentForUser(userId, documentId);
  if (!document) return null;
  const [lines, charges] = await Promise.all([
    db
      .select()
      .from(documentLineItems)
      .where(eq(documentLineItems.documentId, document.id))
      .orderBy(asc(documentLineItems.sortOrder), asc(documentLineItems.lineNo)),
    db
      .select()
      .from(documentAdditionalCharges)
      .where(eq(documentAdditionalCharges.documentId, document.id))
      .orderBy(asc(documentAdditionalCharges.sortOrder)),
  ]);
  return { document, lines, charges };
}

export async function listDocumentsForUser(opts: {
  userId: string;
  businessId?: string;
  docType?: Document["docType"];
  status?: Document["status"];
  partyId?: string;
  limit?: number;
}): Promise<Document[]> {
  const memberBusinessIds = db
    .select({ id: businessMembers.businessId })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.userId, opts.userId),
        isNull(businessMembers.deletedAt),
      ),
    );

  const whereParts = [
    inArray(documents.businessId, memberBusinessIds),
    isNull(documents.deletedAt),
  ];
  if (opts.businessId) whereParts.push(eq(documents.businessId, opts.businessId));
  if (opts.docType) whereParts.push(eq(documents.docType, opts.docType));
  if (opts.status) whereParts.push(eq(documents.status, opts.status));
  if (opts.partyId) whereParts.push(eq(documents.partyId, opts.partyId));

  return db
    .select()
    .from(documents)
    .where(and(...whereParts))
    .orderBy(desc(documents.docDate), desc(documents.createdAt))
    .limit(opts.limit ?? 200);
}

/**
 * `Document` joined with its party's display name — the shape every list
 * page needs. Lifted out into its own helper so we don't write the same
 * leftJoin in five list pages (sales-invoices, quotations, credit-notes,
 * purchase-invoices, debit-notes — plus the shared `<DocumentListView>`).
 *
 * Returns a plain `Document` with `partyName` welded on as a sibling
 * key — the existing callers that only use `Document` fields still work
 * unchanged; the list views consume the extra key.
 */
export type DocumentWithParty = Document & {
  partyName: string;
};

export async function listDocumentsWithPartyForUser(opts: {
  userId: string;
  businessId?: string;
  docType?: Document["docType"];
  status?: Document["status"];
  partyId?: string;
  limit?: number;
}): Promise<DocumentWithParty[]> {
  const memberBusinessIds = db
    .select({ id: businessMembers.businessId })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.userId, opts.userId),
        isNull(businessMembers.deletedAt),
      ),
    );

  const whereParts = [
    inArray(documents.businessId, memberBusinessIds),
    isNull(documents.deletedAt),
  ];
  if (opts.businessId) whereParts.push(eq(documents.businessId, opts.businessId));
  if (opts.docType) whereParts.push(eq(documents.docType, opts.docType));
  if (opts.status) whereParts.push(eq(documents.status, opts.status));
  if (opts.partyId) whereParts.push(eq(documents.partyId, opts.partyId));

  const rows = await db
    .select({ document: documents, partyName: parties.name })
    .from(documents)
    .innerJoin(parties, eq(parties.id, documents.partyId))
    .where(and(...whereParts))
    .orderBy(desc(documents.docDate), desc(documents.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({ ...r.document, partyName: r.partyName }));
}

export interface DocumentPatch {
  docDate?: string;
  partyId?: string;
  shipToAddressId?: string | null;
  sourceDocId?: string | null;
  originalDocNumber?: string | null;
  originalDocDate?: string | null;
  paymentTermsDays?: number | null;
  dueDate?: string | null;
  placeOfSupplyStateCode?: string | null;
  signatureUrl?: string | null;
  termsConditions?: string | null;
  notes?: string | null;
  autoRoundOffEnabled?: boolean;
  // Totals — written by the service after recomputing line math.
  subtotal?: string;
  totalLineDiscount?: string;
  additionalChargesTaxable?: string;
  additionalChargesNonTaxable?: string;
  taxableAmount?: string;
  cgstAmount?: string;
  sgstAmount?: string;
  igstAmount?: string;
  totalTaxAmount?: string;
  billLevelDiscount?: string;
  roundOff?: string;
  grandTotal?: string;
  amountReceived?: string;
  transportMode?: string | null;
  vehicleNumber?: string | null;
  ewayBillNumber?: string | null;
}

export async function updateDocumentTx(
  tx: Tx,
  documentId: string,
  patch: DocumentPatch,
): Promise<Document> {
  const [row] = await tx
    .update(documents)
    .set(patch)
    .where(eq(documents.id, documentId))
    .returning();
  if (!row) throw new Error("Update document returned no row");
  return row;
}

/**
 * Finalise transition — assign number + shareToken, flip status to 'unpaid',
 * stamp finalisedAt. Only callable from inside the finalise tx.
 */
export async function markFinalisedTx(
  tx: Tx,
  documentId: string,
  patch: {
    docNumber: string;
    shareToken: string;
    finalisedAt: Date;
  },
): Promise<Document> {
  const [row] = await tx
    .update(documents)
    .set({
      docNumber: patch.docNumber,
      shareToken: patch.shareToken,
      finalisedAt: patch.finalisedAt,
      status: "unpaid",
    })
    .where(eq(documents.id, documentId))
    .returning();
  if (!row) throw new Error("markFinalisedTx returned no row");
  return row;
}

export async function markCancelledTx(
  tx: Tx,
  documentId: string,
  reason: string | null,
): Promise<Document> {
  const [row] = await tx
    .update(documents)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledReason: reason,
    })
    .where(eq(documents.id, documentId))
    .returning();
  if (!row) throw new Error("markCancelledTx returned no row");
  return row;
}

/** Hard-delete is acceptable only for drafts. Callers enforce the check. */
export async function hardDeleteDocumentTx(
  tx: Tx,
  documentId: string,
): Promise<void> {
  // FK on lines/charges is ON DELETE CASCADE, so they go too.
  await tx.delete(documents).where(eq(documents.id, documentId));
}

/** Soft delete — for safety paths that prefer to retain history. */
export async function softDeleteDocumentTx(
  tx: Tx,
  documentId: string,
): Promise<void> {
  await tx
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(eq(documents.id, documentId));
}

/** Used by the party detail page to list a party's transactions. */
export async function listDocumentsForParty(
  businessId: string,
  partyId: string,
  limit = 200,
): Promise<Document[]> {
  return db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.businessId, businessId),
        eq(documents.partyId, partyId),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.docDate), desc(documents.createdAt))
    .limit(limit);
}

/**
 * Auth-free lookup by share_token — for the public `/i/[shareToken]` view.
 * The token IS the auth; callers must understand that. Drafts have no token
 * (NULL) so they are structurally excluded. Cancelled / soft-deleted docs
 * are skipped so a revoked share returns 404, not stale content.
 */
export async function getDocumentByShareToken(
  shareToken: string,
): Promise<Document | null> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.shareToken, shareToken),
        isNull(documents.deletedAt),
        ne(documents.status, "cancelled"),
      ),
    );
  return doc ?? null;
}

/**
 * Sum of outstanding balance across all finalised, non-cancelled sales
 * documents for one business. Outstanding = grand_total − amount_received.
 * Excludes drafts (no number) and cancelled (reversed in the ledger).
 *
 * Sales-side only — purchase docs sit in the parallel "payables" report.
 * The dashboard's "outstanding" KPI is the udhaar (receivables) headline.
 */
export async function sumSalesOutstandingForBusiness(
  businessId: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${documents.grandTotal} - ${documents.amountReceived}), 0)::text`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.businessId, businessId),
        eq(documents.docType, "sales_invoice"),
        isNull(documents.deletedAt),
        ne(documents.status, "draft"),
        ne(documents.status, "cancelled"),
      ),
    );
  return row?.total ?? "0";
}

/**
 * Sales revenue since a calendar date — SUM(grand_total) over finalised,
 * non-cancelled sales invoices with doc_date >= since. `since` is YYYY-MM-DD.
 */
export async function sumSalesRevenueForBusinessSince(
  businessId: string,
  since: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${documents.grandTotal}), 0)::text`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.businessId, businessId),
        eq(documents.docType, "sales_invoice"),
        isNull(documents.deletedAt),
        ne(documents.status, "draft"),
        ne(documents.status, "cancelled"),
        gte(documents.docDate, since),
      ),
    );
  return row?.total ?? "0";
}
