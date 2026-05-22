/**
 * Public-document service — auth-free read path behind `/i/[shareToken]`.
 *
 * The share token IS the auth: any holder of the URL sees the document (it's
 * a share link, by design). The repository helpers used here are the
 * unscoped `find*` / `getDocumentByShareToken` variants — every caller of
 * this service must understand that.
 *
 * Returns null when the token resolves to nothing — the page maps that to
 * 404 so a probe can't distinguish "doesn't exist" from "soft-deleted /
 * cancelled / owning business gone".
 */
import "server-only";
import { asc, eq } from "drizzle-orm";

import { db } from "../db";
import {
  type Business,
  type Document,
  type DocumentAdditionalCharge,
  type DocumentLineItem,
  type Party,
  documentAdditionalCharges,
  documentLineItems,
} from "../db/schema";
import { findBusinessById } from "../repositories/businesses";
import { getDocumentByShareToken } from "../repositories/documents";
import { findPartyById } from "../repositories/parties";

export interface PublicDocumentView {
  document: Document;
  lines: DocumentLineItem[];
  charges: DocumentAdditionalCharge[];
  business: Business;
  party: Party | null;
}

export async function getPublicDocumentView(
  shareToken: string,
): Promise<PublicDocumentView | null> {
  const document = await getDocumentByShareToken(shareToken);
  if (!document) return null;

  // The owning business must still exist and not be soft-deleted; otherwise
  // the share is a dead link. (A deleted business hides ALL its documents
  // from the public view — same as the seller intending no further sharing.)
  const business = await findBusinessById(document.businessId);
  if (!business) return null;

  const [lines, charges, party] = await Promise.all([
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
    findPartyById(document.partyId),
  ]);

  return { document, lines, charges, business, party };
}
