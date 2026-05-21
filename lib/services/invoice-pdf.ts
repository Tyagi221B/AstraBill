/**
 * Invoice → PDF. Loads an invoice + its business + customer, assembles the
 * typed RenderRequest, and calls the pdf-service.
 *
 * This is the one place that bridges the DB shape to the render contract.
 * The pdf-service stays a dumb renderer (lib/pdf/contract.ts) — every
 * derived value (HSN summary, amount-in-words, taxClass, extra-charge
 * splits) is computed here, on the Next side, before the call.
 */
import "server-only";
import Decimal from "decimal.js";

import { AppError, NotFoundError } from "../errors";
import { getBusinessForUser } from "../repositories/businesses";
import { amountInWords } from "../pdf/amount-in-words";
import { buildHsnSummary } from "../pdf/hsn-summary";
import { fixtures } from "../pdf/fixtures";
import type {
  BrandFont,
  BrandingPayload,
  HsnSummaryRow,
  InvoicePayload,
  RenderRequest,
  TaxRateBreakdown,
  TemplateId,
} from "../pdf/contract";
import type { Business, Customer } from "../db/schema";
import { buildUpiPayUrl, renderUpiQrDataUrl } from "../upi";
import { getCustomer } from "./customers";
import { getInvoice, listInvoicesForUser } from "./invoices";
import { getPublicInvoiceView } from "./public-invoice";

type CreatedInvoiceRow = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

const TEMPLATE_IDS: readonly TemplateId[] = ["modern", "classic"];
const BRAND_FONTS: readonly BrandFont[] = [
  "inter",
  "poppins",
  "noto_serif",
  "noto_sans",
];

/** Coerce a stored string to a known template id, falling back to modern. */
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

/** Join non-empty address fragments into a multi-line block. */
function addressBlock(parts: Array<string | null>): string | null {
  const lines = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return lines.length ? lines.join("\n") : null;
}

/**
 * Group the HSN summary by total GST rate into one TaxRateBreakdown entry per
 * rate, sorted ascending. The summary box renders these as separate rate rows
 * — industry convention; an invoice with both 5% and 18% goods shows BOTH
 * rows (`IGST @5%`, `IGST @18%`), not one aggregate "IGST".
 */
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
    // Interstate rows carry igstRate; intrastate rows carry cgstRate+sgstRate.
    // The customer-facing total rate is the IGST rate or the sum of CGST+SGST.
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

async function buildRenderRequest(
  invoice: CreatedInvoiceRow,
  business: Business,
  customer: Customer | null,
): Promise<RenderRequest> {
  // An invoice carries IGST xor CGST/SGST; non-zero IGST ⇒ interstate.
  const taxClass =
    new Decimal(invoice.igstAmount).greaterThan(0)
      ? "interstate"
      : "intrastate";

  // Extra-charge totals: taxable charges fold into the taxable base pre-GST,
  // non-taxable ones ride on the rounded total — keep the two sums distinct.
  let extraTaxable = new Decimal(0);
  let extraNonTaxable = new Decimal(0);
  for (const c of invoice.extraCharges) {
    if (c.taxable) extraTaxable = extraTaxable.plus(c.amount || "0");
    else extraNonTaxable = extraNonTaxable.plus(c.amount || "0");
  }

  const lineItems = invoice.lineItems
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Built once, used twice — for the contract field and for the per-rate
  // tax breakdown the summary renders.
  const hsnSummary = buildHsnSummary(
    lineItems.map((l) => ({
      hsnCode: l.hsnCode,
      gstRate: l.gstRate,
      taxableAmount: l.taxableAmount,
      cgstAmount: l.cgstAmount,
      sgstAmount: l.sgstAmount,
      igstAmount: l.igstAmount,
    })),
    taxClass,
  );

  // UPI deep-link QR for the PDF footer. Only built when the business has
  // a VPA AND there is money still due — a draft has no number, a paid
  // invoice has nothing to collect. The QR encodes the *outstanding*
  // amount so a partially-paid invoice asks for the remainder.
  const outstandingForQr = new Decimal(invoice.total)
    .minus(invoice.amountPaid || "0")
    .toFixed(2);
  let upiQrDataUrl: string | null = null;
  if (
    business.upiId &&
    invoice.status !== "draft" &&
    invoice.status !== "paid" &&
    new Decimal(outstandingForQr).greaterThan(0)
  ) {
    const upiUrl = buildUpiPayUrl({
      vpa: business.upiId,
      payeeName: business.name,
      amount: outstandingForQr,
      invoiceNumber: invoice.number,
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

  const payload: InvoicePayload = {
    number: invoice.number,
    type: invoice.type,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,

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

    billTo: customer
      ? {
          name: customer.name,
          gstin: customer.gstin,
          address: addressBlock([
            customer.addressLine1,
            customer.addressLine2,
            [customer.city, customer.state, customer.pincode]
              .filter(Boolean)
              .join(", ") || null,
          ]),
          phone: customer.phone,
          stateCode: customer.stateCode,
        }
      : {
          name: "Walk-in customer",
          gstin: null,
          address: null,
          phone: null,
          stateCode: null,
        },

    shipTo: invoice.shipToName
      ? { name: invoice.shipToName, address: invoice.shipToAddress ?? "" }
      : null,

    lineItems: lineItems.map((l) => ({
      description: l.description,
      hsnCode: l.hsnCode,
      quantity: l.quantity,
      unit: l.unit,
      secondaryQuantity: l.secondaryQuantity,
      secondaryUnit: l.secondaryUnit,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount,
      gstRate: l.gstRate,
      // GST-INCLUSIVE per line — the customer reads "this line costs X
      // total." Matches competitor convention (myBillBook, Vyapar, SK
      // Trading clones). The summary box carries the pre-GST breakdown,
      // so reconciliation moves there, not into the line.
      amount: l.amount,
    })),

    extraCharges: invoice.extraCharges.map((c) => ({
      label: c.label,
      amount: c.amount,
      taxable: c.taxable,
      gstRate: c.gstRate ?? null,
    })),

    hsnSummary: hsnSummary,

    totals: {
      subtotal: invoice.subtotal,
      discountAmount: invoice.discountAmount,
      extraChargesTaxable: extraTaxable.toFixed(2),
      extraChargesNonTaxable: extraNonTaxable.toFixed(2),
      taxableAmount: invoice.taxableAmount,
      cgstAmount: invoice.cgstAmount,
      sgstAmount: invoice.sgstAmount,
      igstAmount: invoice.igstAmount,
      taxBreakdown: buildTaxBreakdown(hsnSummary),
      roundOff: invoice.roundOff,
      total: invoice.total,
      totalInWords: amountInWords(invoice.total),
      taxClass,
    },

    transport: {
      mode: invoice.transportMode,
      vehicleNumber: invoice.vehicleNumber,
      ewayBillNumber: invoice.ewayBillNumber,
    },

    notes: invoice.notes,
    terms: business.invoiceTerms,
  };

  return {
    invoice: payload,
    branding: {
      logoUrl: business.logoUrl,
      color: business.brandColor,
      font: asBrandFont(business.brandFont),
      template: asTemplateId(business.invoiceTemplateId),
      // Free plan carries the footer mark; paid plans remove it.
      showFooterMark: business.plan === "free",
      columns: business.invoiceSettings.columns,
    },
  };
}

export interface RenderedInvoicePdf {
  bytes: Buffer;
  filename: string;
}

/**
 * Render one invoice to PDF bytes. Throws NotFoundError if the invoice isn't
 * visible to the user; AppError(503/502) if the pdf-service is unconfigured
 * or fails.
 */
export async function renderInvoicePdf(
  invoiceId: string,
  actorUserId: string,
): Promise<RenderedInvoicePdf> {
  const invoice = await getInvoice(invoiceId, actorUserId);
  if (!invoice) throw new NotFoundError("Invoice not found");

  const business = await getBusinessForUser(actorUserId, invoice.businessId);
  if (!business) throw new NotFoundError("Invoice not found");

  const customer = invoice.customerId
    ? await getCustomer(invoice.customerId, actorUserId)
    : null;

  const payload = await buildRenderRequest(invoice, business, customer);
  const bytes = await postRender(payload);
  const safeNumber = (invoice.number ?? "draft").replace(/[^\w-]+/g, "-");
  return { bytes, filename: `${safeNumber}.pdf` };
}

/**
 * Render the PDF for the public `/i/[shareToken]` path — same renderer, but
 * the auth is the token itself, not a user session. Used by both the
 * "Download PDF" button on the public page and (later) the WhatsApp send
 * code if it ever attaches the PDF as a document.
 *
 * Throws NotFoundError if the token resolves to nothing; AppError(503/502)
 * if the pdf-service is unconfigured or fails.
 */
export async function renderPublicInvoicePdfByToken(
  shareToken: string,
): Promise<RenderedInvoicePdf> {
  const view = await getPublicInvoiceView(shareToken);
  if (!view) throw new NotFoundError("Invoice not found");

  const payload = await buildRenderRequest(
    view.invoice,
    view.business,
    view.customer,
  );
  const bytes = await postRender(payload);
  const safeNumber = (view.invoice.number ?? "draft").replace(/[^\w-]+/g, "-");
  return { bytes, filename: `${safeNumber}.pdf` };
}

/**
 * POST a RenderRequest to the pdf-service and return the PDF bytes. The one
 * place that talks HTTP to the renderer — shared by the invoice download and
 * the branding preview.
 */
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
  // Shared-secret auth — set on both sides in prod; absent in local dev.
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

/** The visual branding fields a preview lets the user fiddle with. */
export interface PreviewBranding {
  logoUrl: string | null;
  color: string;
  font: BrandFont;
  template: TemplateId;
  columns: BrandingPayload["columns"];
}

/**
 * Render a branding preview PDF — the right-pane iframe on /settings/branding.
 *
 * Uses the business's most-recent FINALISED invoice so the owner previews
 * their own real data branded; falls back to a sample fixture when the
 * business has issued nothing yet. The branding is the *unsaved* settings the
 * user is editing — except `showFooterMark`, which is derived from the plan
 * here (never trust a client param: a free user could otherwise fake removal).
 */
export async function renderBrandingPreviewPdf(
  businessId: string,
  actorUserId: string,
  override: PreviewBranding,
): Promise<Buffer> {
  const business = await getBusinessForUser(actorUserId, businessId);
  if (!business) throw new NotFoundError("Business not found");

  const recent = await listInvoicesForUser({
    userId: actorUserId,
    businessId,
    limit: 30,
  });
  const finalised = recent.find((i) => i.number !== null);

  let invoicePayload: InvoicePayload;
  if (finalised) {
    const full = await getInvoice(finalised.id, actorUserId);
    const customer = full?.customerId
      ? await getCustomer(full.customerId, actorUserId)
      : null;
    invoicePayload = full
      ? (await buildRenderRequest(full, business, customer)).invoice
      : fixtures.complex.invoice;
  } else {
    invoicePayload = fixtures.complex.invoice;
  }

  const branding: BrandingPayload = {
    logoUrl: override.logoUrl,
    color: override.color,
    font: override.font,
    template: override.template,
    showFooterMark: business.plan === "free",
    columns: override.columns,
  };

  return postRender({ invoice: invoicePayload, branding });
}
