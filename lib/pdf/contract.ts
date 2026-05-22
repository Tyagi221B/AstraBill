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

/** Mirrors `lib/db/schema.ts` `docType` enum — the canonical doc taxonomy. */
export type DocumentType =
  | "sales_invoice"
  | "estimate"
  | "delivery_challan"
  | "credit_note"
  | "purchase_invoice"
  | "debit_note"
  | "quotation"
  | "proforma_invoice";

/** Mirrors `lib/db/schema.ts` `docStatus` enum. */
export type DocumentStatus =
  | "draft"
  | "unpaid"
  | "partial_paid"
  | "paid"
  | "cancelled";

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

// ---- Business / parties on the document -------------------------------

export interface BusinessOnDocument {
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
    /**
     * Pre-rendered QR code (base64 PNG data URL) of the `upi://pay?...`
     * deep link for this document. Built on the Next.js side from
     * `business.upi_id` + the document total + number. The template renders
     * it as `<img src>` next to the UPI ID text so a customer can scan and
     * pay directly from a printed/forwarded copy. Null when the business
     * has no VPA set, or the document is already paid / a draft.
     */
    upiQrDataUrl: string | null;
  } | null;
}

export interface BillToOnDocument {
  /** "Walk-in customer" if the document has no saved party. */
  name: string;
  gstin: string | null;
  address: string | null;
  phone: string | null;
  stateCode: string | null;
}

export interface ShipToOnDocument {
  name: string;
  address: string;
}

// ---- Line items --------------------------------------------------------

export interface LineItemOnDocument {
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

export interface ExtraChargeOnDocument {
  label: string;
  amount: string;
  taxable: boolean;
  /** Only present when taxable=true. */
  gstRate: string | null;
}

// ---- Totals (derived; precomputed by Next.js) --------------------------

/**
 * One row of the per-rate tax aggregation. The summary box renders these as
 * separate `CGST @9% · ₹X / SGST @9% · ₹X` rows (intrastate) or
 * `IGST @18% · ₹X` rows (interstate), one per distinct GST rate on the
 * document. This is industry standard — every competitor SME invoice
 * (myBillBook, Vyapar) splits the tax summary by rate.
 */
export interface TaxRateBreakdown {
  /** The customer-facing total GST rate, e.g. "18" for 18% (= CGST+SGST or = IGST). */
  rate: string;
  /** CGST half-rate as a percentage string, "" for interstate. */
  cgstRate: string;
  cgstAmount: string;
  /** SGST half-rate as a percentage string, "" for interstate. */
  sgstRate: string;
  sgstAmount: string;
  /** Full IGST rate (= `rate`) for interstate, "" for intrastate. */
  igstRate: string;
  igstAmount: string;
}

export interface TotalsOnDocument {
  subtotal: string;
  discountAmount: string;
  /** Sum of taxable extra charges, folded into the taxable base pre-GST. */
  extraChargesTaxable: string;
  /** Sum of non-taxable extras (informal freight, loading), added post-tax. */
  extraChargesNonTaxable: string;
  taxableAmount: string;
  /** Aggregate CGST across every rate. Kept for compatibility / single-line callers. */
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  /**
   * Per-rate breakdown — one entry per distinct GST rate on this document,
   * sorted ascending. The templates render this as separate rate rows in
   * the summary; the aggregate cgst/sgst/igstAmount above stays for
   * backward compatibility and quick sums.
   */
  taxBreakdown: TaxRateBreakdown[];
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

// ---- Top-level document payload ---------------------------------------

export interface DocumentPayload {
  /** Null while in draft; assigned at finalise — see DECISIONS "Doc number assignment". */
  number: string | null;
  type: DocumentType;
  status: DocumentStatus;
  /** ISO date strings (YYYY-MM-DD). The renderer formats them for display. */
  issueDate: string;
  dueDate: string | null;

  business: BusinessOnDocument;
  billTo: BillToOnDocument;
  shipTo: ShipToOnDocument | null;

  lineItems: LineItemOnDocument[];
  extraCharges: ExtraChargeOnDocument[];
  hsnSummary: HsnSummaryRow[];

  totals: TotalsOnDocument;
  transport: TransportBlock;

  /** Per-document notes printed below the line items. */
  notes: string | null;
  /** Per-document T&C; falls back upstream to the per-doc-type entry in
   *  `businesses.doc_type_defaults` (DECISIONS "Per-doc-type T&C defaults"). */
  terms: string | null;
}

// ---- Render request / response ----------------------------------------

export interface RenderRequest {
  document: DocumentPayload;
  branding: BrandingPayload;
}

export interface RenderResponse {
  /** Cloudinary URL of the uploaded PDF. */
  pdfUrl: string;
  /** Render duration in ms — useful for monitoring tail latency. */
  renderMs: number;
}
