/**
 * Invoice-number formatting — pure, no IO.
 *
 * A finalised invoice's number is `{prefix}/{FY}/{seq}` — e.g. `INV/26-27/0001`.
 *
 * The number is assigned when the invoice is FINALISED (not when the draft is
 * created), built from the issue date the invoice carries at that moment.
 * A draft moved across an FY boundary therefore takes the later FY's series.
 *
 * The sequence resets per business + type + financial year, and counts only
 * finalised rows — an abandoned draft never burns a number, so there are no
 * gaps in the issued series.
 */
import type { Invoice } from "./db/schema";
import { financialYear } from "./fy";

type InvoiceType = Invoice["type"];

/** Default prefix per invoice type. */
const DEFAULT_PREFIX: Record<InvoiceType, string> = {
  tax_invoice: "INV",
  estimate: "EST",
  cash_receipt: "CR",
  credit_note: "CN",
  debit_note: "DN",
  delivery_challan: "DC",
};

const SEQUENCE_PAD = 4;

/**
 * The prefix to print for an invoice number.
 *
 * A business-configured custom prefix applies to TAX INVOICES ONLY. Applying
 * it across every type would let a tax invoice and (say) an estimate both
 * resolve to `ACME/26-27/0001`, since the sequence resets per type — and the
 * `(business_id, number)` unique constraint would then reject the second one.
 * Keeping non-tax types on their built-in prefixes guarantees no collision.
 */
export function invoicePrefix(
  type: InvoiceType,
  customPrefix?: string | null,
): string {
  const custom = customPrefix?.trim();
  if (type === "tax_invoice" && custom) return custom;
  return DEFAULT_PREFIX[type];
}

export interface BuildInvoiceNumberInput {
  type: InvoiceType;
  /** The issue date the invoice carries AT FINALISE (YYYY-MM-DD). Drives FY. */
  issueDate: string;
  /** 1-based — `(finalised invoices of this type in this FY) + 1`. */
  sequence: number;
  /** From `businesses.invoiceNumberPrefix`; only honoured for tax invoices. */
  customPrefix?: string | null;
}

/** Build the printed invoice number. Pure: same inputs → same string. */
export function buildInvoiceNumber(input: BuildInvoiceNumberInput): string {
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new Error(
      `invoice-number: sequence must be a positive integer, got ${input.sequence}`,
    );
  }
  const prefix = invoicePrefix(input.type, input.customPrefix);
  const seq = String(input.sequence).padStart(SEQUENCE_PAD, "0");
  return `${prefix}/${financialYear(input.issueDate)}/${seq}`;
}
