/**
 * Invoice repository — the only place Drizzle queries for the invoices /
 * line_items tables live. Every query scopes by `business_id` (the tenant
 * isolation invariant). No business rules here.
 */
import "server-only";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import type { Tx } from "../db";
import {
  type Business,
  type Customer,
  type Invoice,
  type InvoiceLineItem,
  type NewInvoice,
  type NewInvoiceLineItem,
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

/** Bypass — used during a service's create flow where the tx-private state
 *  needs a final read after inserts. Kept here for SSOT discipline (only this
 *  file knows the Drizzle shape of the joined read). */
export { sql };
