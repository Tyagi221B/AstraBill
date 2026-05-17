/**
 * GST math — pure functions, no IO. The single source of truth for invoice
 * tax calculation: intrastate vs interstate split, line-level computation,
 * invoice-level totals, and round-off.
 *
 * Why decimal.js: Drizzle's `numeric()` columns return strings to preserve
 * precision; doing math on them as JS numbers risks float drift across many
 * line items (0.1 + 0.2 = 0.30000000000000004). decimal.js is the standard
 * fix for money, ~22KB, no deps.
 *
 * Rounding: ROUND_HALF_UP throughout (the convention on Indian invoices —
 * "round half away from zero" is what humans expect when an invoice rounds).
 */
import Decimal from "decimal.js";

Decimal.set({
  precision: 30,
  rounding: Decimal.ROUND_HALF_UP,
});

/** "intrastate" → CGST+SGST split; "interstate" → IGST only. */
export type TaxClass = "intrastate" | "interstate";

/**
 * Decide tax class from the seller's state and the place-of-supply state code.
 * Falls back to "intrastate" when either is unknown — the conservative default
 * for the seller (CGST+SGST tax is paid to the home state, which is safer
 * if the customer's state turns out to be the same).
 */
export function classifyTax(
  businessStateCode: string | null | undefined,
  placeOfSupplyStateCode: string | null | undefined,
): TaxClass {
  if (!businessStateCode || !placeOfSupplyStateCode) return "intrastate";
  return businessStateCode === placeOfSupplyStateCode ? "intrastate" : "interstate";
}

// ---- Line item ---------------------------------------------------------

export interface LineItemInput {
  /** Up to 3 decimals (fractional kg, sqft). */
  quantity: string;
  /** Money string, 2 decimals. */
  unitPrice: string;
  /** Line-level discount; absolute money, applied to (qty × unitPrice). */
  discountAmount?: string | null;
  /** GST rate as a percentage, e.g. "18.00". */
  gstRate: string;
}

export interface LineItemAmounts {
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  /** Line total INCLUDING tax. */
  amount: string;
}

/**
 * Compute one line item's monetary breakdown. Returns all values as 2-decimal
 * strings ready to insert into `numeric(12,2)` columns.
 */
export function computeLineItem(
  input: LineItemInput,
  klass: TaxClass,
): LineItemAmounts {
  const qty = new Decimal(input.quantity);
  const unitPrice = new Decimal(input.unitPrice);
  const discount = new Decimal(input.discountAmount ?? "0");
  const gstRate = new Decimal(input.gstRate);

  const gross = qty.mul(unitPrice);
  const taxable = gross.sub(discount);
  const taxTotal = taxable.mul(gstRate).div(100);

  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);
  if (klass === "intrastate") {
    // Split exactly in half — round halves up so the two halves sum back
    // to the original tax, no off-by-paisa.
    const half = taxTotal.div(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    cgst = half;
    sgst = taxTotal.sub(half); // takes the other half; same value when round
  } else {
    igst = taxTotal;
  }

  const amount = taxable.add(cgst).add(sgst).add(igst);

  return {
    taxableAmount: taxable.toFixed(2),
    cgstAmount: cgst.toFixed(2),
    sgstAmount: sgst.toFixed(2),
    igstAmount: igst.toFixed(2),
    amount: amount.toFixed(2),
  };
}

// ---- Invoice totals ----------------------------------------------------

export interface InvoiceTotals {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  taxAmount: string;
  /** Pre-round-off total (taxable + tax). */
  totalBeforeRound: string;
  /** Adjustment from totalBeforeRound to the displayed `total` (rupee rounding). */
  roundOff: string;
  /** Final amount payable, rounded to the nearest whole rupee. */
  total: string;
}

/**
 * Aggregate a set of already-computed line items into invoice totals. Applies
 * round-off to the whole rupee (standard on Indian invoices).
 */
export function computeInvoiceTotals(
  lines: (LineItemInput & LineItemAmounts)[],
): InvoiceTotals {
  let subtotal = new Decimal(0);
  let discount = new Decimal(0);
  let taxable = new Decimal(0);
  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);

  for (const l of lines) {
    const qty = new Decimal(l.quantity);
    const unitPrice = new Decimal(l.unitPrice);
    subtotal = subtotal.add(qty.mul(unitPrice));
    discount = discount.add(new Decimal(l.discountAmount ?? "0"));
    taxable = taxable.add(new Decimal(l.taxableAmount));
    cgst = cgst.add(new Decimal(l.cgstAmount));
    sgst = sgst.add(new Decimal(l.sgstAmount));
    igst = igst.add(new Decimal(l.igstAmount));
  }

  const tax = cgst.add(sgst).add(igst);
  const preRound = taxable.add(tax);
  const rounded = preRound.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const roundOff = rounded.sub(preRound);

  return {
    subtotal: subtotal.toFixed(2),
    discountAmount: discount.toFixed(2),
    taxableAmount: taxable.toFixed(2),
    cgstAmount: cgst.toFixed(2),
    sgstAmount: sgst.toFixed(2),
    igstAmount: igst.toFixed(2),
    taxAmount: tax.toFixed(2),
    totalBeforeRound: preRound.toFixed(2),
    roundOff: roundOff.toFixed(2),
    total: rounded.toFixed(2),
  };
}
