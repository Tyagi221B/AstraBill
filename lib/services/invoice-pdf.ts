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
import type {
  BrandFont,
  InvoicePayload,
  RenderRequest,
  TemplateId,
} from "../pdf/contract";
import type { Business, Customer } from "../db/schema";
import { getCustomer } from "./customers";
import { getInvoice } from "./invoices";

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

function buildRenderRequest(
  invoice: CreatedInvoiceRow,
  business: Business,
  customer: Customer | null,
): RenderRequest {
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
      // The "Amount" column is the pre-GST taxable value, so the column
      // sums to the subtotal — NOT l.amount, which is GST-inclusive.
      amount: l.taxableAmount,
    })),

    extraCharges: invoice.extraCharges.map((c) => ({
      label: c.label,
      amount: c.amount,
      taxable: c.taxable,
      gstRate: c.gstRate ?? null,
    })),

    hsnSummary: buildHsnSummary(
      lineItems.map((l) => ({
        hsnCode: l.hsnCode,
        gstRate: l.gstRate,
        taxableAmount: l.taxableAmount,
        cgstAmount: l.cgstAmount,
        sgstAmount: l.sgstAmount,
        igstAmount: l.igstAmount,
      })),
      taxClass,
    ),

    totals: {
      subtotal: invoice.subtotal,
      discountAmount: invoice.discountAmount,
      extraChargesTaxable: extraTaxable.toFixed(2),
      extraChargesNonTaxable: extraNonTaxable.toFixed(2),
      taxableAmount: invoice.taxableAmount,
      cgstAmount: invoice.cgstAmount,
      sgstAmount: invoice.sgstAmount,
      igstAmount: invoice.igstAmount,
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

  const serviceUrl = process.env.PDF_SERVICE_URL;
  if (!serviceUrl) {
    throw new AppError(
      "PDF generation is unavailable — the render service is not configured.",
      { status: 503, code: "SERVICE_UNAVAILABLE" },
    );
  }

  const payload = buildRenderRequest(invoice, business, customer);

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

  const bytes = Buffer.from(await res.arrayBuffer());
  const safeNumber = (invoice.number ?? "draft").replace(/[^\w-]+/g, "-");
  return { bytes, filename: `${safeNumber}.pdf` };
}
