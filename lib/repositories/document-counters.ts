/**
 * document_counters repository — per (business, doc_type, fy_year) row.
 *
 * Counter rows are created lazily on the first finalise for that
 * (doc_type, FY). The seed values for prefix + sequenceTemplate come from
 * the prior-FY row when one exists (so an owner who set "INV/" as the
 * prefix last year still gets "INV/" this year), else defaults.
 *
 * Numbering invariant: every assigned number is the result of a FOR UPDATE
 * read of the counter row + one INCREMENT, all in the same transaction.
 * Concurrent finalises for the same (business, doc_type, FY) serialise on
 * the row lock; different FYs / doc_types remain fully parallel.
 */
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";

import { type Tx } from "../db";
import {
  type DocumentCounter,
  type NewDocumentCounter,
  documentCounters,
  type DocTypeValue,
} from "../db/schema";

/**
 * Lock the (business, doc_type, fy_year) counter row with FOR UPDATE,
 * creating it inline if it doesn't exist. The first call for a new FY
 * inherits its prefix + template from the prior-FY row (so owners don't
 * have to re-set their numbering format every April).
 */
export async function lockOrCreateCounterTx(
  tx: Tx,
  opts: {
    businessId: string;
    docType: DocTypeValue;
    fyYear: string;
  },
): Promise<DocumentCounter> {
  // 1) Try to lock an existing row.
  const [existing] = await tx
    .select()
    .from(documentCounters)
    .where(
      and(
        eq(documentCounters.businessId, opts.businessId),
        eq(documentCounters.docType, opts.docType),
        eq(documentCounters.fyYear, opts.fyYear),
      ),
    )
    .for("update");
  if (existing) return existing;

  // 2) No row yet — inherit prefix + template from the most recent prior-FY
  //    row for this (business, doc_type) if one exists.
  const [prior] = await tx
    .select({
      prefix: documentCounters.prefix,
      sequenceTemplate: documentCounters.sequenceTemplate,
      resetEachFy: documentCounters.resetEachFy,
      nextSequence: documentCounters.nextSequence,
    })
    .from(documentCounters)
    .where(
      and(
        eq(documentCounters.businessId, opts.businessId),
        eq(documentCounters.docType, opts.docType),
      ),
    )
    .orderBy(desc(documentCounters.createdAt))
    .limit(1);

  const seed: NewDocumentCounter = {
    businessId: opts.businessId,
    docType: opts.docType,
    fyYear: opts.fyYear,
    prefix: prior?.prefix ?? defaultPrefixForType(opts.docType),
    sequenceTemplate: prior?.sequenceTemplate ?? "{PREFIX}{SEQ:3}",
    nextSequence:
      prior && prior.resetEachFy === false
        ? prior.nextSequence
        : 1,
    resetEachFy: prior?.resetEachFy ?? true,
  };

  // 3) Insert. ON CONFLICT covers a concurrent insert race (another tx beat
  //    us to creating the row); in that case fetch + lock the existing row.
  const [inserted] = await tx
    .insert(documentCounters)
    .values(seed)
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    // Re-select under FOR UPDATE so we hold the lock for the increment.
    const [locked] = await tx
      .select()
      .from(documentCounters)
      .where(eq(documentCounters.id, inserted.id))
      .for("update");
    if (!locked) {
      throw new Error("lockOrCreateCounterTx: inserted row disappeared");
    }
    return locked;
  }

  // Concurrent winner — pick up their row.
  const [winner] = await tx
    .select()
    .from(documentCounters)
    .where(
      and(
        eq(documentCounters.businessId, opts.businessId),
        eq(documentCounters.docType, opts.docType),
        eq(documentCounters.fyYear, opts.fyYear),
      ),
    )
    .for("update");
  if (!winner) {
    throw new Error("lockOrCreateCounterTx: lost a race and no row to lock");
  }
  return winner;
}

/**
 * Bump the next_sequence under the same tx + lock acquired by
 * `lockOrCreateCounterTx`. Returns the new value.
 */
export async function incrementSequenceTx(
  tx: Tx,
  counterId: string,
): Promise<number> {
  const [row] = await tx
    .update(documentCounters)
    .set({ nextSequence: sql`${documentCounters.nextSequence} + 1` })
    .where(eq(documentCounters.id, counterId))
    .returning({ nextSequence: documentCounters.nextSequence });
  if (!row) {
    throw new Error("incrementSequenceTx: counter row disappeared");
  }
  return row.nextSequence;
}

/**
 * List every counter row for one business — used by the Invoice Settings
 * editor. Sorted by doc_type + fy_year so the UI can stable-iterate.
 *
 * Tenant scope is enforced by the caller (the service checks membership +
 * settings:edit before invoking this).
 */
export async function listCountersForBusinessTx(
  tx: Tx,
  businessId: string,
): Promise<DocumentCounter[]> {
  return tx
    .select()
    .from(documentCounters)
    .where(eq(documentCounters.businessId, businessId))
    .orderBy(documentCounters.docType, desc(documentCounters.fyYear));
}

/** Lookup defaults for the per-doc-type starting prefix. */
function defaultPrefixForType(docType: DocTypeValue): string {
  switch (docType) {
    case "sales_invoice":
      return "INV-";
    case "estimate":
      return "EST-";
    case "delivery_challan":
      return "DC-";
    case "credit_note":
      return "CN-";
    case "purchase_invoice":
      return "PI-";
    case "debit_note":
      return "DN-";
    case "quotation":
      return "QT-";
    case "proforma_invoice":
      return "PF-";
  }
}
