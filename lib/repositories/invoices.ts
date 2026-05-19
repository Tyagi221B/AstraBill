/**
 * Invoice repository — the only place Drizzle queries for the invoices /
 * line_items tables live. Every query scopes by `business_id` (the tenant
 * isolation invariant). No business rules here.
 */
import "server-only";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";

import { db, type DB, type Tx } from "../db";
import {
  type Business,
  type Customer,
  type ExtraCharge,
  type Invoice,
  type InvoiceLineItem,
  type NewInvoice,
  type NewInvoiceLineItem,
  businessMembers,
  businesses,
  customers,
  invoiceLineItems,
  invoices,
} from "../db/schema";

/**
 * Acquire the business row with `FOR UPDATE` lock. The finalise path holds
 * this lock per business so number assignment is race-free — two concurrent
 * finalises against the same business serialise on it, the second sees the
 * first's row before counting.
 */
export async function lockBusinessRow(
  tx: Tx,
  businessId: string,
): Promise<Business | null> {
  const rows = await tx
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), isNull(businesses.deletedAt)))
    .for("update");
  return rows[0] ?? null;
}

/**
 * Acquire an invoice row with `FOR UPDATE` lock. The payment record/delete
 * path holds this lock so two concurrent payments against the same invoice
 * serialise — the second sees the first's row before re-summing, so the
 * amount-paid total can't lose a row. Soft-deleted invoices return null.
 */
export async function lockInvoiceRow(
  tx: Tx,
  invoiceId: string,
): Promise<Invoice | null> {
  const rows = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)))
    .for("update");
  return rows[0] ?? null;
}

/**
 * Write a recomputed payment state onto an invoice — `amount_paid`, the
 * derived `status`, and `paid_at`. The service computes all three from the
 * payments table (the single source of truth for what's been paid); this
 * just performs the write.
 */
export async function applyPaymentState(
  tx: Tx,
  invoiceId: string,
  state: {
    amountPaid: string;
    status: Invoice["status"];
    paidAt: Date | null;
  },
): Promise<Invoice> {
  const [row] = await tx
    .update(invoices)
    .set({
      amountPaid: state.amountPaid,
      status: state.status,
      paidAt: state.paidAt,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();
  if (!row) throw new Error("Apply payment state returned no row");
  return row;
}

/**
 * Count FINALISED invoices of a given type, within one financial year, for a
 * business. The new number's sequence = this count + 1, so the printed series
 * is gap-free even if a draft is abandoned (drafts aren't counted).
 *
 * Finalised = `status <> 'draft'`. Finalised invoices are immutable — the
 * service refuses to soft-delete them — so the count needs no extra filter on
 * `deleted_at`. Call from inside the finalise transaction, after taking the
 * `lockBusinessRow` lock, so the count can't drift under a concurrent write.
 */
export async function countFinalizedInvoicesOfType(
  tx: Tx,
  businessId: string,
  type: Invoice["type"],
  fyRange: { start: string; end: string },
): Promise<number> {
  const result = await tx
    .select({ c: count() })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, businessId),
        eq(invoices.type, type),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, fyRange.start),
        lte(invoices.issueDate, fyRange.end),
      ),
    );
  return Number(result[0]?.c ?? 0);
}

/** Verify a customer belongs to a business — for input validation. */
export async function findCustomerInBusiness(
  tx: Tx,
  businessId: string,
  customerId: string,
): Promise<Customer | null> {
  const row = await tx.query.customers.findFirst({
    where: and(
      eq(customers.id, customerId),
      eq(customers.businessId, businessId),
      isNull(customers.deletedAt),
    ),
  });
  return row ?? null;
}

/** Verify the "original" invoice for a credit/debit note belongs to the same business. */
export async function findInvoiceInBusiness(
  tx: Tx,
  businessId: string,
  invoiceId: string,
): Promise<Invoice | null> {
  const row = await tx.query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      eq(invoices.businessId, businessId),
      isNull(invoices.deletedAt),
    ),
  });
  return row ?? null;
}

export async function insertInvoice(
  tx: Tx,
  values: NewInvoice,
): Promise<Invoice> {
  const [row] = await tx.insert(invoices).values(values).returning();
  if (!row) throw new Error("Insert invoice returned no row");
  return row;
}

export async function insertLineItems(
  tx: Tx,
  items: NewInvoiceLineItem[],
): Promise<InvoiceLineItem[]> {
  if (items.length === 0) return [];
  return tx.insert(invoiceLineItems).values(items).returning();
}

// IMPORTANT — why these reads use flat db.select() and not db.query.with():
//
// Drizzle's relational query API (`db.query.X.findFirst({ with: { ... } })`)
// fetches nested relations by having Postgres aggregate the child rows into
// JSON (`json_build_array`). A `numeric` column inside that JSON becomes a
// bare JSON number, and JSON.parse turns it into a JS `number` — destroying
// the string type Drizzle declares for `numeric()` columns and that the rest
// of the app (Zod, decimal.js) relies on.
//
// `invoice_line_items` is full of `numeric` columns, so any read that nests
// line items MUST use flat selects and stitch the rows together in JS.
// See DECISIONS.md → "Relational reads" and database-and-rbac.md.

type InvoiceWithLineItems = Invoice & { lineItems: InvoiceLineItem[] };

/** Line items for an invoice, ordered by sortOrder. Flat select — numeric
 *  columns stay strings. Works with either the db handle or a transaction. */
async function selectLineItems(
  exec: DB | Tx,
  invoiceId: string,
): Promise<InvoiceLineItem[]> {
  return exec
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(invoiceLineItems.sortOrder);
}

/** Fetch an invoice with its line items — scoped by business. Two flat
 *  selects joined in JS (no relational `with:` — see note above). */
export async function getInvoiceWithLineItems(
  tx: Tx,
  businessId: string,
  invoiceId: string,
): Promise<InvoiceWithLineItems | null> {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.businessId, businessId),
        isNull(invoices.deletedAt),
      ),
    );
  if (!invoice) return null;
  const lineItems = await selectLineItems(tx, invoiceId);
  return { ...invoice, lineItems };
}

/**
 * Read-only fetch by invoice id, authorised through a `business_members`
 * check — no separate permission roundtrip. Returns null both for "invoice
 * doesn't exist" and "user has no membership", deliberately, so existence
 * isn't leaked to non-members. Flat selects (see note above).
 */
export async function getInvoiceForUser(
  userId: string,
  invoiceId: string,
): Promise<InvoiceWithLineItems | null> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)));
  if (!invoice) return null;

  // Authorise: caller must be an active member of this invoice's business.
  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, invoice.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return null;

  const lineItems = await selectLineItems(db, invoiceId);
  return { ...invoice, lineItems };
}

/** Transaction-bound variant of getInvoiceForUser — used by the update flow
 *  where the auth check must be inside the same tx as the mutation. Flat
 *  selects (see note above). */
export async function getInvoiceForUserTx(
  tx: Tx,
  userId: string,
  invoiceId: string,
): Promise<InvoiceWithLineItems | null> {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)));
  if (!invoice) return null;

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, invoice.businessId),
        eq(businessMembers.userId, userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return null;

  const lineItems = await selectLineItems(tx, invoiceId);
  return { ...invoice, lineItems };
}

/** Hard-delete every line item of an invoice. Used during an update to wipe
 *  the previous set before inserting the new ones — drafts only, called
 *  inside the update transaction. */
export async function deleteLineItemsForInvoice(
  tx: Tx,
  invoiceId: string,
): Promise<void> {
  await tx
    .delete(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId));
}

/** Apply the editable header fields + the freshly computed totals. Locked
 *  fields (number, type, businessId, status, originalInvoiceId, createdBy)
 *  are not part of the patch shape — the service builds it. */
export interface InvoiceHeaderPatch {
  customerId: string | null;
  placeOfSupplyStateCode: string | null;
  notes: string | null;
  issueDate: string;
  dueDate: string | null;
  shipToName: string | null;
  shipToAddress: string | null;
  extraCharges: ExtraCharge[];
  transportMode: string | null;
  vehicleNumber: string | null;
  ewayBillNumber: string | null;
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  taxAmount: string;
  roundOff: string;
  total: string;
}

export async function updateInvoiceHeader(
  tx: Tx,
  invoiceId: string,
  patch: InvoiceHeaderPatch,
): Promise<Invoice> {
  const [row] = await tx
    .update(invoices)
    .set(patch)
    .where(eq(invoices.id, invoiceId))
    .returning();
  if (!row) throw new Error("Update invoice returned no row");
  return row;
}

/** Soft-delete an invoice (sets `deleted_at`). Drafts only — the service
 *  enforces that; this just performs the write. */
export async function softDeleteInvoice(
  tx: Tx,
  invoiceId: string,
): Promise<void> {
  await tx
    .update(invoices)
    .set({ deletedAt: new Date() })
    .where(eq(invoices.id, invoiceId));
}

/**
 * Stamp a draft with its issued number and flip status to `sent` — the single
 * write that finalises an invoice. Combined into one statement so the row is
 * never observed with `status='sent'` but `number IS NULL`.
 *
 * Throws a Postgres `23505` (unique violation) if `(business_id, number)`
 * collides — the service maps that to `ConflictError`.
 */
export async function finalizeInvoiceRow(
  tx: Tx,
  invoiceId: string,
  number: string,
): Promise<Invoice> {
  const [row] = await tx
    .update(invoices)
    .set({ number, status: "sent" })
    .where(eq(invoices.id, invoiceId))
    .returning();
  if (!row) throw new Error("Finalise invoice returned no row");
  return row;
}

/** The business row (no lock) — used during update to recompute tax class. */
export async function getBusinessById(
  tx: Tx,
  businessId: string,
): Promise<Business | null> {
  const row = await tx.query.businesses.findFirst({
    where: and(eq(businesses.id, businessId), isNull(businesses.deletedAt)),
  });
  return row ?? null;
}

/**
 * List invoices the user is allowed to see — every business they're an
 * active member of. Filters: optional businessId (must be one of their
 * memberships, else empty), optional status. Sorted newest-first.
 *
 * Authorisation: uses a SELECT subquery on business_members so an
 * unauthorised businessId simply matches nothing — no existence leak.
 */
export async function listInvoicesForUser(opts: {
  userId: string;
  businessId?: string;
  status?: Invoice["status"];
  limit?: number;
}): Promise<Invoice[]> {
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
    inArray(invoices.businessId, memberBusinessIds),
    isNull(invoices.deletedAt),
  ];
  if (opts.businessId) whereParts.push(eq(invoices.businessId, opts.businessId));
  if (opts.status) whereParts.push(eq(invoices.status, opts.status));

  return db
    .select()
    .from(invoices)
    .where(and(...whereParts))
    .orderBy(desc(invoices.createdAt))
    .limit(opts.limit ?? 50);
}

// ---- Dashboard aggregates ----------------------------------------------

/**
 * Total still owed to a business — `SUM(total - amount_paid)` over every
 * non-draft, non-deleted invoice. Fully-paid invoices contribute 0, so no
 * status filter beyond excluding drafts is needed. The headline udhaar
 * figure. Returns a money string ("0" when there are no invoices).
 */
export async function sumOutstandingForBusiness(
  businessId: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, businessId),
        isNull(invoices.deletedAt),
        ne(invoices.status, "draft"),
      ),
    );
  return row?.total ?? "0";
}

/**
 * Revenue booked since a date — `SUM(total)` over non-draft, non-deleted
 * invoices with `issue_date >= since`. `since` is a YYYY-MM-DD string (the
 * `issue_date` column is a calendar date). Returns a money string.
 */
export async function sumRevenueForBusinessSince(
  businessId: string,
  since: string,
): Promise<string> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${invoices.total}), 0)` })
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, businessId),
        isNull(invoices.deletedAt),
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, since),
      ),
    );
  return row?.total ?? "0";
}

/** Bypass — used during a service's create flow where the tx-private state
 *  needs a final read after inserts. Kept here for SSOT discipline (only this
 *  file knows the Drizzle shape of the joined read). */
export { sql };
