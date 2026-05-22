/**
 * Dashboard service — the read-only aggregates behind `/b/[businessId]/
 * dashboard`. One call, `getBusinessDashboard`, fans out to the new-domain
 * repository aggregates (documents · payment_entries · items) and returns
 * everything the page renders.
 *
 * All money figures come back as decimal strings (the money discipline);
 * the page formats them for display.
 */
import "server-only";

import type { Document, Item } from "../db/schema";
import { NotFoundError } from "../errors";
import { getMembership } from "../rbac";
import {
  listDocumentsForUser,
  sumSalesOutstandingForBusiness,
  sumSalesRevenueForBusinessSince,
} from "../repositories/documents";
import { sumPaymentsInForBusinessSince } from "../repositories/payment-entries";
import { listLowStockItems } from "../repositories/items";

export interface BusinessDashboard {
  /** Total still owed across all finalised sales invoices — the udhaar headline. */
  outstanding: string;
  /** Money received this calendar month (by `payment_entries.entry_date`). */
  paidThisMonth: string;
  /** Sales-invoice value booked this calendar month (by `doc_date`). */
  revenueThisMonth: string;
  /** The six most recent sales invoices, newest first. */
  recentSalesInvoices: Document[];
  /** Active product items at or below their low-stock threshold. */
  lowStock: Array<Item & { currentStock: string }>;
}

/**
 * Everything the dashboard page shows for one business.
 *
 * Self-guarding: throws NotFoundError if the caller isn't an active member
 * (the page's layout already verifies this, but a service must not trust
 * its caller). "This month" is bounded at the 1st of the current month in
 * UTC — the IST/UTC skew at the boundary is an accepted V1 imprecision (a
 * payment in the small hours of the 1st could land in the neighbouring
 * month).
 */
export async function getBusinessDashboard(
  businessId: string,
  actorUserId: string,
): Promise<BusinessDashboard> {
  const membership = await getMembership(actorUserId, businessId);
  if (!membership) throw new NotFoundError("Business not found");

  const now = new Date();
  const monthStartDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
    .toISOString()
    .slice(0, 10);

  const [
    outstanding,
    revenueThisMonth,
    paidThisMonth,
    lowStock,
    recentSalesInvoices,
  ] = await Promise.all([
    sumSalesOutstandingForBusiness(businessId),
    sumSalesRevenueForBusinessSince(businessId, monthStartDate),
    sumPaymentsInForBusinessSince(businessId, monthStartDate),
    listLowStockItems(businessId),
    listDocumentsForUser({
      userId: actorUserId,
      businessId,
      docType: "sales_invoice",
      limit: 6,
    }),
  ]);

  return {
    outstanding,
    paidThisMonth,
    revenueThisMonth,
    recentSalesInvoices,
    lowStock,
  };
}
