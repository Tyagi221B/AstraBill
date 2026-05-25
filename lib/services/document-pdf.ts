/**
 * Document → PDF. Loads a document + its business + party, assembles the
 * typed RenderRequest, and calls the pdf-service.
 *
 * One place bridges the DB shape to the render contract. The pdf-service
 * stays a dumb renderer — every derived value (HSN summary, amount-in-words,
 * taxClass, line + extra-charge splits, GST-inclusive line amount) is
 * computed here, on the Next side, before the call.
 *
 * Two entrypoints:
 *   - `renderDocumentPdf(id, userId)`       authed download (sales-invoice detail)
 *   - `renderPublicDocumentPdfByToken(t)`   share-token auth (public /i/...)
 */
import "server-only";
import Decimal from "decimal.js";

import { AppError, NotFoundError } from "../errors";
import { findBusinessById, getBusinessForUser } from "../repositories/businesses";
import {
  findDocumentWithLinesForUser,
  getDocumentByShareToken,
} from "../repositories/documents";
import { findPartyById } from "../repositories/parties";
import { findAddressById } from "../repositories/party-addresses";
import { amountInWords } from "../pdf/amount-in-words";
import { buildHsnSummary } from "../pdf/hsn-summary";
import type {
  BrandFont,
  BrandingPayload,
  DocumentPayload,
  HsnSummaryRow,
  RenderRequest,
  TaxRateBreakdown,
  TemplateId,
} from "../pdf/contract";
import type {
  Business,
  Document,
  DocumentAdditionalCharge,
  DocumentLineItem,
  Party,
} from "../db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { partyAddresses } from "../db/schema";
import { buildUpiPayUrl, renderUpiQrDataUrl } from "../upi";

const TEMPLATE_IDS: readonly TemplateId[] = ["modern", "classic"];
const BRAND_FONTS: readonly BrandFont[] = [
  "inter",
  "poppins",
  "noto_serif",
  "noto_sans",
];

function asTemplateId(v: string): TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(v)
    ? (v as TemplateId)
    : "modern";
}
function asBrandFont(v: string): BrandFont {
  return (BRAND_FONTS as readonly string[]).includes(v)
    ? (v as BrandFont)
    : "inter";
}

function addressBlock(parts: Array<string | null>): string | null {
  const lines = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return lines.length ? lines.join("\n") : null;
}

function buildTaxBreakdown(
  hsnSummary: HsnSummaryRow[],
): TaxRateBreakdown[] {
  interface Acc {
    cgstRate: string;
    sgstRate: string;
    igstRate: string;
    cgst: Decimal;
    sgst: Decimal;
    igst: Decimal;
  }
  const byRate = new Map<string, Acc>();
  for (const row of hsnSummary) {
    const fullRate = row.igstRate
      ? row.igstRate
      : row.cgstRate && row.sgstRate
        ? new Decimal(row.cgstRate).plus(row.sgstRate).toString()
        : "";
    if (!fullRate) continue;
    const entry = byRate.get(fullRate) ?? {
      cgstRate: row.cgstRate,
      sgstRate: row.sgstRate,
      igstRate: row.igstRate,
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      igst: new Decimal(0),
    };
    entry.cgst = entry.cgst.plus(row.cgstAmount || "0");
    entry.sgst = entry.sgst.plus(row.sgstAmount || "0");
    entry.igst = entry.igst.plus(row.igstAmount || "0");
    byRate.set(fullRate, entry);
  }
  return Array.from(byRate.entries())
    .map(([rate, v]) => ({
      rate,
      cgstRate: v.cgstRate,
      cgstAmount: v.cgst.toFixed(2),
      sgstRate: v.sgstRate,
      sgstAmount: v.sgst.toFixed(2),
      igstRate: v.igstRate,
      igstAmount: v.igst.toFixed(2),
    }))
    .sort((a, b) => Number(a.rate) - Number(b.rate));
}

/**
 * Get the party's default billing address as a multi-line string, falling
 * back to the first non-deleted address. Returns null when the party has
 * none on file. Single query — addresses live in their own table.
 */
async function partyBillingAddress(partyId: string): Promise<{
  block: string | null;
  stateCode: string | null;
}> {
  const rows = await db
    .select()
    .from(partyAddresses)
    .where(eq(partyAddresses.partyId, partyId));
  const candidates = rows.filter((r) => r.deletedAt === null);
  const billing =
    candidates.find((r) => r.kind === "billing" && r.isDefault) ??
    candidates.find((r) => r.kind === "billing") ??
    candidates[0] ??
    null;
  if (!billing) return { block: null, stateCode: null };
  return {
    block: addressBlock([
      billing.streetAddress,
      [billing.city, billing.state, billing.pincode].filter(Boolean).join(", ") ||
        null,
    ]),
    stateCode: billing.stateCode,
  };
}

/**
 * Map (document + lines + charges + business + party) → the renderer's
 * `RenderRequest`. The renderer is dumb — every derived value lands here.
 */
async function buildRenderRequest(
  document: Document,
  lines: DocumentLineItem[],
  charges: DocumentAdditionalCharge[],
  business: Business,
  party: Party | null,
): Promise<RenderRequest> {
  const taxClass = new Decimal(document.igstAmount).greaterThan(0)
    ? "interstate"
    : "intrastate";

  // Additional-charge totals: taxable folds into the taxable base pre-GST,
  // non-taxable rides on the rounded total — keep the two sums distinct.
  let extraTaxable = new Decimal(0);
  let extraNonTaxable = new Decimal(0);
  for (const c of charges) {
    if (c.taxable) extraTaxable = extraTaxable.plus(c.amount || "0");
    else extraNonTaxable = extraNonTaxable.plus(c.amount || "0");
  }

  const sortedLines = lines
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.lineNo - b.lineNo);

  // Per-line GST rate to the HSN summary: NULL (exempted) and 0 (nil-rated)
  // both produce no tax — both rendered as "0" in the summary; the
  // distinction lives in the DB only for GSTR reporting.
  const hsnSummary = buildHsnSummary(
    sortedLines.map((l) => ({
      hsnCode: l.hsnSacCodeSnapshot,
      gstRate: l.gstRate ?? "0",
      taxableAmount: l.taxableAmount,
      cgstAmount: l.cgstAmount,
      sgstAmount: l.sgstAmount,
      igstAmount: l.igstAmount,
    })),
    taxClass,
  );

  // UPI deep-link QR — only when business has VPA AND money still due.
  // Encodes the OUTSTANDING amount so a partial pay asks for the remainder.
  const outstanding = new Decimal(document.grandTotal)
    .minus(document.amountReceived || "0")
    .toFixed(2);
  let upiQrDataUrl: string | null = null;
  if (
    business.upiId &&
    document.status !== "draft" &&
    document.status !== "paid" &&
    document.status !== "cancelled" &&
    new Decimal(outstanding).greaterThan(0)
  ) {
    const upiUrl = buildUpiPayUrl({
      vpa: business.upiId,
      payeeName: business.name,
      amount: outstanding,
      invoiceNumber: document.docNumber,
    });
    if (upiUrl) upiQrDataUrl = await renderUpiQrDataUrl(upiUrl);
  }

  const bank =
    business.bankName ||
    business.bankAccountNumber ||
    business.bankIfsc ||
    business.bankAccountHolder ||
    business.upiId
      ? {
          name: business.bankName,
          accountNumber: business.bankAccountNumber,
          ifsc: business.bankIfsc,
          accountHolder: business.bankAccountHolder,
          upiId: business.upiId,
          upiQrDataUrl,
        }
      : null;

  // Optional ship-to override — null when the document's ship-to is "same
  // as bill-to" (the V1 default). Renderer falls back to billTo in that
  // case. The lookup is unscoped because party_addresses tenant isolation
  // is via the partyId path, and the document already vouches for the
  // tenant.
  const shipToAddr =
    party && document.shipToAddressId
      ? await findAddressById(document.shipToAddressId)
      : null;
  const shipToOverride =
    shipToAddr && party
      ? {
          name: party.name,
          address:
            addressBlock([
              shipToAddr.streetAddress,
              [shipToAddr.city, shipToAddr.state, shipToAddr.pincode]
                .filter(Boolean)
                .join(", ") || null,
            ]) ?? "",
        }
      : null;

  const partyAddr = party
    ? await partyBillingAddress(party.id)
    : { block: null, stateCode: null };

  const payload: DocumentPayload = {
    number: document.docNumber,
    type: document.docType,
    status: document.status,
    issueDate: document.docDate,
    dueDate: document.dueDate,

    business: {
      name: business.name,
      gstin: business.gstin,
      address: addressBlock([
        business.addressLine1,
        business.addressLine2,
        [business.city, business.state, business.pincode]
          .filter(Boolean)
          .join(", ") || null,
      ]),
      stateCode: business.stateCode,
      phone: business.phone,
      email: business.email,
      bank,
    },

    billTo: party
      ? {
          name: party.name,
          gstin: party.gstin,
          address: partyAddr.block,
          phone: party.mobileNumber,
          stateCode: partyAddr.stateCode,
        }
      : {
          name: "Walk-in customer",
          gstin: null,
          address: null,
          phone: null,
          stateCode: null,
        },

    shipTo: shipToOverride,

    lineItems: sortedLines.map((l) => ({
      description: l.description ?? l.itemNameSnapshot,
      hsnCode: l.hsnSacCodeSnapshot,
      quantity: l.quantity,
      unit: l.unitCodeSnapshot ?? "",
      secondaryQuantity: l.secondaryQuantity,
      secondaryUnit: l.secondaryUnitCode,
      unitPrice: l.pricePerUnit,
      discountAmount: l.discountAmount,
      gstRate: l.gstRate ?? "0",
      amount: l.lineAmount,
    })),

    extraCharges: charges.map((c) => ({
      label: c.label,
      amount: c.amount,
      taxable: c.taxable,
      gstRate: c.gstRate ?? null,
    })),

    hsnSummary,

    totals: {
      subtotal: document.subtotal,
      discountAmount: document.totalLineDiscount,
      extraChargesTaxable: extraTaxable.toFixed(2),
      extraChargesNonTaxable: extraNonTaxable.toFixed(2),
      taxableAmount: document.taxableAmount,
      cgstAmount: document.cgstAmount,
      sgstAmount: document.sgstAmount,
      igstAmount: document.igstAmount,
      taxBreakdown: buildTaxBreakdown(hsnSummary),
      roundOff: document.roundOff,
      total: document.grandTotal,
      totalInWords: amountInWords(document.grandTotal),
      taxClass,
    },

    transport: {
      mode: document.transportMode,
      vehicleNumber: document.vehicleNumber,
      ewayBillNumber: document.ewayBillNumber,
    },

    notes: document.notes,
    terms: document.termsConditions,
  };

  return {
    document: payload,
    branding: {
      logoUrl: business.logoUrl,
      color: business.brandColor,
      font: asBrandFont(business.brandFont),
      template: asTemplateId(business.documentTemplateId),
      showFooterMark: business.plan === "free",
      columns: business.documentSettings.columns,
    },
  };
}

export interface RenderedDocumentPdf {
  bytes: Buffer;
  filename: string;
}

/**
 * Render one document to PDF bytes for an authed user. Throws NotFoundError
 * if not visible; AppError(503/502) if the pdf-service is unconfigured / fails.
 */
export async function renderDocumentPdf(
  documentId: string,
  actorUserId: string,
): Promise<RenderedDocumentPdf> {
  const view = await findDocumentWithLinesForUser(actorUserId, documentId);
  if (!view) throw new NotFoundError("Document not found");

  const business = await getBusinessForUser(
    actorUserId,
    view.document.businessId,
  );
  if (!business) throw new NotFoundError("Document not found");

  const party = await findPartyById(view.document.partyId);

  const payload = await buildRenderRequest(
    view.document,
    view.lines,
    view.charges,
    business,
    party,
  );
  const bytes = await postRender(payload);
  const safeNumber = (view.document.docNumber ?? "draft").replace(
    /[^\w-]+/g,
    "-",
  );
  return { bytes, filename: `${safeNumber}.pdf` };
}

/**
 * Render the PDF for the public `/i/[shareToken]` path. Token IS the auth —
 * no membership check. Used by the customer-facing "Download PDF" button.
 */
export async function renderPublicDocumentPdfByToken(
  shareToken: string,
): Promise<RenderedDocumentPdf> {
  const document = await getDocumentByShareToken(shareToken);
  if (!document) throw new NotFoundError("Document not found");

  const business = await findBusinessById(document.businessId);
  if (!business) throw new NotFoundError("Document not found");

  // Pull lines + charges via unscoped reads — public path may not assume a
  // user session, and the document was already proven legitimate by the
  // share-token lookup above.
  const lines = await db.query.documentLineItems.findMany({
    where: (t, { eq }) => eq(t.documentId, document.id),
  });
  const charges = await db.query.documentAdditionalCharges.findMany({
    where: (t, { eq }) => eq(t.documentId, document.id),
  });

  const party = await findPartyById(document.partyId);

  const payload = await buildRenderRequest(
    document,
    lines,
    charges,
    business,
    party,
  );
  const bytes = await postRender(payload);
  const safeNumber = (document.docNumber ?? "draft").replace(/[^\w-]+/g, "-");
  return { bytes, filename: `${safeNumber}.pdf` };
}

async function postRender(payload: RenderRequest): Promise<Buffer> {
  const serviceUrl = process.env.PDF_SERVICE_URL;
  if (!serviceUrl) {
    throw new AppError(
      "PDF generation is unavailable — the render service is not configured.",
      { status: 503, code: "SERVICE_UNAVAILABLE" },
    );
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const token = process.env.PDF_SERVICE_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${serviceUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new AppError("Could not reach the PDF render service.", {
      status: 502,
      code: "PDF_SERVICE_UNREACHABLE",
      cause,
    });
  }
  if (!res.ok) {
    throw new AppError(`PDF render failed (HTTP ${res.status}).`, {
      status: 502,
      code: "PDF_RENDER_FAILED",
    });
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Visual branding fields the /settings/print-settings preview lets the user fiddle
 * with. Shape mirrors what the right-pane iframe needs — `showFooterMark` is
 * derived server-side from the plan to keep a free user from faking removal.
 */
export interface PreviewBranding {
  logoUrl: string | null;
  color: string;
  font: BrandFont;
  template: TemplateId;
  columns: BrandingPayload["columns"];
}

/**
 * Render a branding preview PDF using the business's most-recent finalised
 * sales invoice. Falls back to a fixture when nothing has been issued yet.
 */
export async function renderBrandingPreviewPdf(
  businessId: string,
  actorUserId: string,
  override: PreviewBranding,
): Promise<Buffer> {
  const business = await getBusinessForUser(actorUserId, businessId);
  if (!business) throw new NotFoundError("Business not found");

  const recent = await db.query.documents.findMany({
    where: (t, { and, eq, isNull, ne }) =>
      and(
        eq(t.businessId, businessId),
        eq(t.docType, "sales_invoice"),
        isNull(t.deletedAt),
        ne(t.status, "draft"),
      ),
    orderBy: (t, { desc }) => [desc(t.docDate), desc(t.createdAt)],
    limit: 1,
  });
  const recentDoc = recent[0];

  let documentPayload: DocumentPayload;
  if (recentDoc) {
    const view = await findDocumentWithLinesForUser(actorUserId, recentDoc.id);
    if (view) {
      const party = await findPartyById(view.document.partyId);
      documentPayload = (
        await buildRenderRequest(
          view.document,
          view.lines,
          view.charges,
          business,
          party,
        )
      ).document;
    } else {
      // Membership-scoped read missed (race) — fall back to fixture.
      const { fixtures } = await import("../pdf/fixtures");
      documentPayload = fixtures.complex.document;
    }
  } else {
    const { fixtures } = await import("../pdf/fixtures");
    documentPayload = fixtures.complex.document;
  }

  const branding: BrandingPayload = {
    logoUrl: override.logoUrl,
    color: override.color,
    font: override.font,
    template: override.template,
    showFooterMark: business.plan === "free",
    columns: override.columns,
  };

  return postRender({ document: documentPayload, branding });
}
