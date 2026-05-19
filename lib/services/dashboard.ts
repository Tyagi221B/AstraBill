/**
 * Dashboard service — the read-only aggregates behind `/b/[businessId]/
 * dashboard`. One call, `getBusinessDashboard`, fans out to the repository
 * aggregates and returns everything the page renders.
 *
 * All money figures come back as decimal strings (the money discipline);
 * the page formats them for display.
 */
import "server-only";

import type { Invoice, Product } from "../db/schema";
import { NotFoundError } from "../errors";
import { getMembership } from "../rbac";
import {
  listInvoicesForUser,
  sumOutstandingForBusiness,
  sumRevenueForBusinessSince,
} from "../repositories/invoices";
import { sumPaymentsForBusinessSince } from "../repositories/payments";
import { listLowStockProducts } from "../repositories/products";

export interface BusinessDashboard {
  /** Total still owed across all non-draft invoices — the udhaar headline. */
  outstanding: string;
  /** Money received this calendar month (by payment `paid_at`). */
  paidThisMonth: string;
  /** Invoice value booked this calendar month (by `issue_date`). */
  revenueThisMonth: string;
  /** The six most recent invoices, newest first. */
  recentInvoices: Invoice[];
  /** Active products at or below their low-stock threshold. */
  lowStock: Product[];
}

/**
 * Everything the dashboard page shows for one business.
 *
 * Self-guarding: throws NotFoundError if the caller isn't an active member
 * (the page's layout already verifies this, but a service must not trust
 * its caller). "This month" is bounded at the 1st of the current month —
 * UTC midnight; the IST/UTC skew at the boundary is an accepted V1
 * imprecision (a payment in the small hours of the 1st could land in the
 * neighbouring month).
 */
export async function getBusinessDashboard(
  businessId: string,
  actorUserId: string,
): Promise<BusinessDashboard> {
  const membership = await getMembership(actorUserId, businessId);
  if (!membership) throw new NotFoundError("Business not found");

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthStartDate = monthStart.toISOString().slice(0, 10);

  const [
    outstanding,
    revenueThisMonth,
    paidThisMonth,
    lowStock,
    recentInvoices,
  ] = await Promise.all([
    sumOutstandingForBusiness(businessId),
    sumRevenueForBusinessSince(businessId, monthStartDate),
    sumPaymentsForBusinessSince(businessId, monthStart),
    listLowStockProducts(businessId),
    listInvoicesForUser({ userId: actorUserId, businessId, limit: 6 }),
  ]);

  return {
    outstanding,
    paidThisMonth,
    revenueThisMonth,
    recentInvoices,
    lowStock,
  };
}
