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

// ---- Extra charges -----------------------------------------------------

/**
 * One ad-hoc charge on an invoice (cutting, hole, labour, freight, loading…).
 *
 * Taxable charges (real-invoice example: Diamond Tuff's cut-out charge) fold
 * into the pre-GST taxable base at their own `gstRate`; their tax splits into
 * CGST+SGST or IGST per the invoice's tax class.
 *
 * Non-taxable charges (real-invoice example: Om Glass's informal freight) are
 * added AFTER round-off — they neither move the taxable base nor get rounded
 * themselves, so the invoice's final total may carry paise when a non-taxable
 * charge has decimals.
 */
export interface ExtraChargeInput {
  /** Money string, 2 decimals. */
  amount: string;
  taxable: boolean;
  /** GST rate as a percentage ("18.00"). Required when `taxable` is true. */
  gstRate?: string | null;
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
  /** Sum of taxable extra-charge amounts (already folded into taxableAmount). */
  extraChargesTaxable: string;
  /** Sum of non-taxable extra-charge amounts (added post-round-off to total). */
  extraChargesNonTaxable: string;
  /** Pre-round-off total of the taxable side only (taxable + tax). */
  totalBeforeRound: string;
  /** Adjustment that rounds `totalBeforeRound` to a whole rupee. */
  roundOff: string;
  /** Final amount payable: round(totalBeforeRound) + non-taxable extras. */
  total: string;
}

/**
 * Aggregate already-computed line items into invoice totals, optionally with
 * extra charges. Applies round-off to the whole rupee on the taxable side
 * (standard on Indian invoices); non-taxable charges are added on top after
 * round-off (so a flat ₹200 freight leaves the total clean).
 *
 * `taxClass` is only consulted when there are taxable extra charges (whose
 * tax has to split the same way line tax does). Defaults to intrastate, the
 * conservative choice for the seller — matches `classifyTax`'s own fallback.
 */
export function computeInvoiceTotals(
  lines: (LineItemInput & LineItemAmounts)[],
  opts: { extraCharges?: ExtraChargeInput[]; taxClass?: TaxClass } = {},
): InvoiceTotals {
  const klass: TaxClass = opts.taxClass ?? "intrastate";

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

  // Fold extra charges in.
  let extraTaxable = new Decimal(0);
  let extraNonTaxable = new Decimal(0);

  for (const c of opts.extraCharges ?? []) {
    const amt = new Decimal(c.amount);
    if (c.taxable) {
      if (c.gstRate == null) {
        throw new Error("invoice totals: taxable extra charge needs a gstRate");
      }
      const rate = new Decimal(c.gstRate);
      const chargeTax = amt.mul(rate).div(100);
      extraTaxable = extraTaxable.add(amt);
      taxable = taxable.add(amt);
      if (klass === "intrastate") {
        // Same paise-preserving split as computeLineItem.
        const half = chargeTax
          .div(2)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        cgst = cgst.add(half);
        sgst = sgst.add(chargeTax.sub(half));
      } else {
        igst = igst.add(chargeTax);
      }
    } else {
      extraNonTaxable = extraNonTaxable.add(amt);
    }
  }

  const tax = cgst.add(sgst).add(igst);
  const preRound = taxable.add(tax);
  const rounded = preRound.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const roundOff = rounded.sub(preRound);
  const total = rounded.add(extraNonTaxable);

  return {
    subtotal: subtotal.toFixed(2),
    discountAmount: discount.toFixed(2),
    taxableAmount: taxable.toFixed(2),
    cgstAmount: cgst.toFixed(2),
    sgstAmount: sgst.toFixed(2),
    igstAmount: igst.toFixed(2),
    taxAmount: tax.toFixed(2),
    extraChargesTaxable: extraTaxable.toFixed(2),
    extraChargesNonTaxable: extraNonTaxable.toFixed(2),
    totalBeforeRound: preRound.toFixed(2),
    roundOff: roundOff.toFixed(2),
    total: total.toFixed(2),
  };
}
