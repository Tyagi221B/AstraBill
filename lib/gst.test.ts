import { describe, expect, it } from "vitest";

import {
  type LineItemInput,
  type TaxClass,
  classifyTax,
  computeInvoiceTotals,
  computeLineItem,
} from "./gst";

/** Build a totals-ready line: input fields + the computed amounts. */
function line(input: LineItemInput, klass: TaxClass) {
  return { ...input, ...computeLineItem(input, klass) };
}

describe("classifyTax", () => {
  it("is intrastate when seller and place-of-supply states match", () => {
    expect(classifyTax("07", "07")).toBe("intrastate");
  });

  it("is interstate when the states differ", () => {
    expect(classifyTax("07", "29")).toBe("interstate");
  });

  it("falls back to intrastate when either state is missing", () => {
    expect(classifyTax(null, null)).toBe("intrastate");
    expect(classifyTax("07", null)).toBe("intrastate");
    expect(classifyTax(null, "29")).toBe("intrastate");
    expect(classifyTax(undefined, undefined)).toBe("intrastate");
  });
});

describe("computeLineItem — intrastate (CGST + SGST)", () => {
  it("splits 18% GST evenly into CGST and SGST", () => {
    expect(
      computeLineItem(
        { quantity: "10", unitPrice: "100", gstRate: "18" },
        "intrastate",
      ),
    ).toEqual({
      taxableAmount: "1000.00",
      cgstAmount: "90.00",
      sgstAmount: "90.00",
      igstAmount: "0.00",
      amount: "1180.00",
    });
  });

  it("handles every standard slab", () => {
    const at = (gstRate: string) =>
      computeLineItem(
        { quantity: "10", unitPrice: "100", gstRate },
        "intrastate",
      );
    expect(at("0")).toMatchObject({ cgstAmount: "0.00", amount: "1000.00" });
    expect(at("5")).toMatchObject({ cgstAmount: "25.00", amount: "1050.00" });
    expect(at("12")).toMatchObject({ cgstAmount: "60.00", amount: "1120.00" });
    expect(at("28")).toMatchObject({ cgstAmount: "140.00", amount: "1280.00" });
  });

  it("subtracts a line discount before computing tax", () => {
    expect(
      computeLineItem(
        { quantity: "10", unitPrice: "100", discountAmount: "200", gstRate: "18" },
        "intrastate",
      ),
    ).toEqual({
      taxableAmount: "800.00",
      cgstAmount: "72.00",
      sgstAmount: "72.00",
      igstAmount: "0.00",
      amount: "944.00",
    });
  });

  it("supports fractional quantities", () => {
    expect(
      computeLineItem(
        { quantity: "2.5", unitPrice: "40", gstRate: "18" },
        "intrastate",
      ),
    ).toMatchObject({ taxableAmount: "100.00", amount: "118.00" });
  });

  it("rounds an odd-paise tax so the two halves still sum to the total", () => {
    // tax = 0.20 × 5% = 0.01 — cannot split evenly.
    const r = computeLineItem(
      { quantity: "1", unitPrice: "0.20", gstRate: "5" },
      "intrastate",
    );
    expect(r).toEqual({
      taxableAmount: "0.20",
      cgstAmount: "0.01",
      sgstAmount: "0.00",
      igstAmount: "0.00",
      amount: "0.21",
    });
    // The invariant the implementation promises: halves sum back to the tax.
    expect(Number(r.cgstAmount) + Number(r.sgstAmount)).toBe(0.01);
  });
});

describe("computeLineItem — interstate (IGST)", () => {
  it("puts the whole tax in IGST, none in CGST/SGST", () => {
    expect(
      computeLineItem(
        { quantity: "10", unitPrice: "100", gstRate: "18" },
        "interstate",
      ),
    ).toEqual({
      taxableAmount: "1000.00",
      cgstAmount: "0.00",
      sgstAmount: "0.00",
      igstAmount: "180.00",
      amount: "1180.00",
    });
  });
});

describe("computeInvoiceTotals", () => {
  it("returns all-zero totals for an empty invoice", () => {
    expect(computeInvoiceTotals([])).toEqual({
      subtotal: "0.00",
      discountAmount: "0.00",
      taxableAmount: "0.00",
      cgstAmount: "0.00",
      sgstAmount: "0.00",
      igstAmount: "0.00",
      taxAmount: "0.00",
      totalBeforeRound: "0.00",
      roundOff: "0.00",
      total: "0.00",
    });
  });

  it("aggregates a single clean line with no round-off", () => {
    const totals = computeInvoiceTotals([
      line({ quantity: "10", unitPrice: "100", gstRate: "18" }, "intrastate"),
    ]);
    expect(totals).toEqual({
      subtotal: "1000.00",
      discountAmount: "0.00",
      taxableAmount: "1000.00",
      cgstAmount: "90.00",
      sgstAmount: "90.00",
      igstAmount: "0.00",
      taxAmount: "180.00",
      totalBeforeRound: "1180.00",
      roundOff: "0.00",
      total: "1180.00",
    });
  });

  it("rounds the total DOWN and records a negative round-off", () => {
    const totals = computeInvoiceTotals([
      line({ quantity: "1", unitPrice: "99.50", gstRate: "18" }, "intrastate"),
    ]);
    expect(totals).toMatchObject({
      taxableAmount: "99.50",
      taxAmount: "17.91",
      totalBeforeRound: "117.41",
      roundOff: "-0.41",
      total: "117.00",
    });
  });

  it("rounds the total UP and records a positive round-off", () => {
    const totals = computeInvoiceTotals([
      line({ quantity: "1", unitPrice: "99.70", gstRate: "18" }, "intrastate"),
    ]);
    expect(totals).toMatchObject({
      taxableAmount: "99.70",
      taxAmount: "17.95",
      totalBeforeRound: "117.65",
      roundOff: "0.35",
      total: "118.00",
    });
  });

  it("sums multiple lines, mixed slabs, and a per-line discount", () => {
    const totals = computeInvoiceTotals([
      line({ quantity: "10", unitPrice: "100", gstRate: "18" }, "intrastate"),
      line(
        { quantity: "5", unitPrice: "50", discountAmount: "20", gstRate: "12" },
        "intrastate",
      ),
    ]);
    expect(totals).toEqual({
      subtotal: "1250.00",
      discountAmount: "20.00",
      taxableAmount: "1230.00",
      cgstAmount: "103.80",
      sgstAmount: "103.80",
      igstAmount: "0.00",
      taxAmount: "207.60",
      totalBeforeRound: "1437.60",
      roundOff: "0.40",
      total: "1438.00",
    });
  });

  it("aggregates interstate lines into IGST", () => {
    const totals = computeInvoiceTotals([
      line({ quantity: "10", unitPrice: "100", gstRate: "18" }, "interstate"),
    ]);
    expect(totals).toMatchObject({
      cgstAmount: "0.00",
      sgstAmount: "0.00",
      igstAmount: "180.00",
      taxAmount: "180.00",
      total: "1180.00",
    });
  });
});
