/**
 * PDF render contract — the typed payload flowing Next.js → pdf-service.
 *
 * Two design rules:
 *
 *   1. Money is *always* a string. Decimal precision lives at the DB layer
 *      (NUMERIC(12,2)); strings preserve it across the JSON boundary. Never
 *      let a renderer Number()-coerce a money field — see DECISIONS.md
 *      "Relational reads / Money fields".
 *
 *   2. The renderer is dumb. It receives a fully-derived payload (HSN
 *      summary, amount-in-words, taxClass already computed) and never
 *      reaches back into the DB. That keeps the pdf-service deployable in
 *      isolation and unit-testable against fixtures. All GST math lives in
 *      lib/gst.ts on the Next side; helper functions compute the derived
 *      pieces just before the call.
 *
 * Canonical copy (Next.js side). The pdf-service keeps a deliberate mirror
 * at pdf-service/src/contract.ts — it owns its own copy so it builds and
 * deploys independently. Edit BOTH when the contract changes; they always
 * change together (producer + consumer of the same payload).
 */

export type TemplateId = "modern" | "classic";

export type BrandFont = "inter" | "poppins" | "noto_serif" | "noto_sans";

export type TaxClass = "intrastate" | "interstate";

export type InvoiceType =
  | "tax_invoice"
  | "estimate"
  | "cash_receipt"
  | "credit_note"
  | "debit_note"
  | "delivery_challan";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "seen"
  | "partially_paid"
  | "paid"
  | "overdue";

// ---- Branding payload --------------------------------------------------

export interface BrandingPayload {
  /** Cloudinary URL of the owner's uploaded logo; null = no logo set. */
  logoUrl: string | null;
  /** Brand hex colour, validated `^#[0-9a-fA-F]{6}$`. */
  color: string;
  font: BrandFont;
  template: TemplateId;
  /** Free plan = true (renders "Made with AstraBill"); paid = false. */
  showFooterMark: boolean;
  /** Column visibility flags. All-true by default; 2C.5 lets users toggle. */
  columns: {
    hsn: boolean;
    batch: boolean;
    mfg: boolean;
    exp: boolean;
    discount: boolean;
    tax: boolean;
    secondaryQty: boolean;
  };
}

// ---- Business / parties on the invoice --------------------------------

export interface BusinessOnInvoice {
  name: string;
  gstin: string | null;
  /** Full address as a multi-line string, already joined with newlines. */
  address: string | null;
  stateCode: string | null;
  phone: string | null;
  email: string | null;
  /** Optional bank-details block printed in the footer. */
  bank: {
    name: string | null;
    accountNumber: string | null;
    ifsc: string | null;
    accountHolder: string | null;
    upiId: string | null;
  } | null;
}

export interface BillToOnInvoice {
  /** "Walk-in customer" if the invoice has no saved customer. */
  name: string;
  gstin: string | null;
  address: string | null;
  phone: string | null;
  stateCode: string | null;
}

export interface ShipToOnInvoice {
  name: string;
  address: string;
}

// ---- Line items --------------------------------------------------------

export interface LineItemOnInvoice {
  description: string;
  hsnCode: string | null;
  /** Rate-bearing quantity. The dual-unit secondary is informational only. */
  quantity: string;
  unit: string;
  secondaryQuantity: string | null;
  secondaryUnit: string | null;
  unitPrice: string;
  discountAmount: string;
  gstRate: string;
  /**
   * GST-INCLUSIVE line total — qty × rate − discount + per-line GST. This
   * is what the "Amount" column shows: the final amount the customer pays
   * for this line. Matches competitor convention; the pre-GST breakdown
   * lives in the summary box (`totals.taxableAmount` + the per-tax rows),
   * so reconciliation happens there, not by summing the Amount column.
   */
  amount: string;
}

// ---- Extra charges ----------------------------------------------------

export interface ExtraChargeOnInvoice {
  label: string;
  amount: string;
  taxable: boolean;
  /** Only present when taxable=true. */
  gstRate: string | null;
}

// ---- Totals (derived; precomputed by Next.js) --------------------------

export interface TotalsOnInvoice {
  subtotal: string;
  discountAmount: string;
  /** Sum of taxable extra charges, folded into the taxable base pre-GST. */
  extraChargesTaxable: string;
  /** Sum of non-taxable extras (informal freight, loading), added post-tax. */
  extraChargesNonTaxable: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  /** Sign-bearing; preserve the "-" prefix on negative round-offs. */
  roundOff: string;
  total: string;
  /** Rendered string e.g. "Three Thousand Seven Hundred Fifteen Rupees Only". */
  totalInWords: string;
  taxClass: TaxClass;
}

// ---- HSN tax summary (derived; precomputed by Next.js) -----------------

export interface HsnSummaryRow {
  hsnCode: string;
  taxableValue: string;
  /** Empty strings for the leg that doesn't apply for this taxClass. */
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
}

// ---- Transport block (all optional) -----------------------------------

export interface TransportBlock {
  mode: string | null;
  vehicleNumber: string | null;
  ewayBillNumber: string | null;
}

// ---- Top-level invoice payload ----------------------------------------

export interface InvoicePayload {
  /** Null while in draft; assigned at finalise — see DECISIONS "Invoice numbering". */
  number: string | null;
  type: InvoiceType;
  status: InvoiceStatus;
  /** ISO date strings (YYYY-MM-DD). The renderer formats them for display. */
  issueDate: string;
  dueDate: string | null;

  business: BusinessOnInvoice;
  billTo: BillToOnInvoice;
  shipTo: ShipToOnInvoice | null;

  lineItems: LineItemOnInvoice[];
  extraCharges: ExtraChargeOnInvoice[];
  hsnSummary: HsnSummaryRow[];

  totals: TotalsOnInvoice;
  transport: TransportBlock;

  /** Per-invoice notes printed below the line items. */
  notes: string | null;
  /** Per-invoice T&C; falls back to business-level invoice_terms upstream. */
  terms: string | null;
}

// ---- Render request / response ----------------------------------------

export interface RenderRequest {
  invoice: InvoicePayload;
  branding: BrandingPayload;
}

export interface RenderResponse {
  /** Cloudinary URL of the uploaded PDF. */
  pdfUrl: string;
  /** Render duration in ms — useful for monitoring tail latency. */
  renderMs: number;
}
