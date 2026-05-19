/**
 * Public-invoice service — the auth-free read path behind `/i/[shareToken]`.
 *
 * The share token IS the auth: any holder of the URL sees the invoice (it's
 * a share link, by design). The repository functions used here are the
 * `find*` variants that skip membership scoping — every caller of this
 * service must understand that.
 *
 * Returns null for "no such token" / "invoice soft-deleted" / "owning
 * business soft-deleted" — the page maps any of those to 404 so a probe
 * can't distinguish them.
 */
import "server-only";

import type { Business, Customer, InvoiceLineItem, Invoice } from "../db/schema";
import { findBusinessById } from "../repositories/businesses";
import { findCustomerById } from "../repositories/customers";
import { getInvoiceByShareToken } from "../repositories/invoices";

export interface PublicInvoiceView {
  invoice: Invoice & { lineItems: InvoiceLineItem[] };
  business: Business;
  customer: Customer | null;
}

export async function getPublicInvoiceView(
  shareToken: string,
): Promise<PublicInvoiceView | null> {
  const invoice = await getInvoiceByShareToken(shareToken);
  if (!invoice) return null;

  // The owning business must still exist and not be soft-deleted; otherwise
  // the share is a dead link. (A deleted business hides ALL its invoices
  // from the public view — same as the seller intending no further sharing.)
  const business = await findBusinessById(invoice.businessId);
  if (!business) return null;

  const customer = invoice.customerId
    ? await findCustomerById(invoice.customerId)
    : null;

  return { invoice, business, customer };
}
