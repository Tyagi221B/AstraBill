/**
 * Invoice repository — the only place Drizzle queries for the invoices /
 * line_items tables live. Every query scopes by `business_id` (the tenant
 * isolation invariant). No business rules here.
 */
import "server-only";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type Tx } from "../db";
import {
  type Business,
  type Customer,
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
 * Acquire the business row with `FOR UPDATE` lock. All invoice-write paths
 * serialize on this lock per business — the cheapest correct mechanism for
 * race-free per-type invoice numbering.
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
 * Count existing invoices of a given type for a business, including
 * soft-deleted ones — invoice numbers are never reused even if a draft is
 * removed (audit trail integrity).
 */
export async function countInvoicesOfType(
  tx: Tx,
  businessId: string,
  type: Invoice["type"],
): Promise<number> {
  const result = await tx
    .select({ c: count() })
    .from(invoices)
    .where(and(eq(invoices.businessId, businessId), eq(invoices.type, type)));
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

/** Fetch an invoice with its line items — scoped by business. */
export async function getInvoiceWithLineItems(
  tx: Tx,
  businessId: string,
  invoiceId: string,
): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null> {
  const row = await tx.query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      eq(invoices.businessId, businessId),
      isNull(invoices.deletedAt),
    ),
    with: { lineItems: true },
  });
  return row ?? null;
}

/**
 * Read-only fetch by invoice id, authorised through a `business_members`
 * JOIN — no separate permission roundtrip. Returns null both for "invoice
 * doesn't exist" and "user has no membership", deliberately, so existence
 * isn't leaked to non-members.
 */
export async function getInvoiceForUser(
  userId: string,
  invoiceId: string,
): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null> {
  const row = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)),
    with: { lineItems: true },
  });
  if (!row) return null;

  // Authorise: caller must be an active member of this invoice's business.
  const member = await db.query.businessMembers.findFirst({
    where: and(
      eq(businessMembers.businessId, row.businessId),
      eq(businessMembers.userId, userId),
      isNull(businessMembers.deletedAt),
    ),
  });
  if (!member) return null;
  return row;
}

/** Transaction-bound variant of getInvoiceForUser — used by the update flow
 *  where the auth check must be inside the same tx as the mutation. */
export async function getInvoiceForUserTx(
  tx: Tx,
  userId: string,
  invoiceId: string,
): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | null> {
  const row = await tx.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)),
    with: { lineItems: true },
  });
  if (!row) return null;
  const member = await tx.query.businessMembers.findFirst({
    where: and(
      eq(businessMembers.businessId, row.businessId),
      eq(businessMembers.userId, userId),
      isNull(businessMembers.deletedAt),
    ),
  });
  if (!member) return null;
  return row;
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
  placeOfSupplyStateCode: string | null;
  notes: string | null;
  issueDate: string;
  dueDate: string | null;
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

/** Bypass — used during a service's create flow where the tx-private state
 *  needs a final read after inserts. Kept here for SSOT discipline (only this
 *  file knows the Drizzle shape of the joined read). */
export { sql };
