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
      extraChargesTaxable: "0.00",
      extraChargesNonTaxable: "0.00",
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
      extraChargesTaxable: "0.00",
      extraChargesNonTaxable: "0.00",
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
      extraChargesTaxable: "0.00",
      extraChargesNonTaxable: "0.00",
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

describe("computeInvoiceTotals — extra charges", () => {
  // Real-invoice motif: Diamond Tuff TAXES the cut-out / processing charge.
  it("folds a taxable charge into the pre-GST base at its own GST rate", () => {
    const totals = computeInvoiceTotals(
      [
        line(
          { quantity: "10", unitPrice: "100", gstRate: "18" },
          "intrastate",
        ),
      ],
      {
        taxClass: "intrastate",
        extraCharges: [
          { amount: "200", taxable: true, gstRate: "18" },
          // Cutting / labour at the same rate as the goods.
        ],
      },
    );
    // Goods taxable 1000 + charge 200 = 1200 taxable; tax 216 (108+108);
    // pre-round 1416; whole rupee already, no round-off.
    expect(totals).toMatchObject({
      taxableAmount: "1200.00",
      cgstAmount: "108.00",
      sgstAmount: "108.00",
      igstAmount: "0.00",
      taxAmount: "216.00",
      extraChargesTaxable: "200.00",
      extraChargesNonTaxable: "0.00",
      totalBeforeRound: "1416.00",
      roundOff: "0.00",
      total: "1416.00",
    });
  });

  it("splits a taxable charge into IGST under an interstate invoice", () => {
    const totals = computeInvoiceTotals(
      [
        line(
          { quantity: "10", unitPrice: "100", gstRate: "18" },
          "interstate",
        ),
      ],
      {
        taxClass: "interstate",
        extraCharges: [{ amount: "200", taxable: true, gstRate: "18" }],
      },
    );
    expect(totals).toMatchObject({
      cgstAmount: "0.00",
      sgstAmount: "0.00",
      igstAmount: "216.00",
      total: "1416.00",
    });
  });

  // Real-invoice motif: Om Glass adds informal freight POST-tax.
  it("adds a non-taxable charge AFTER round-off, leaving the taxable side untouched", () => {
    const totals = computeInvoiceTotals(
      [
        // 99.50 → tax 17.91 → preRound 117.41 → round 117 (roundOff -0.41).
        line(
          { quantity: "1", unitPrice: "99.50", gstRate: "18" },
          "intrastate",
        ),
      ],
      {
        taxClass: "intrastate",
        extraCharges: [{ amount: "200", taxable: false }],
      },
    );
    expect(totals).toMatchObject({
      taxableAmount: "99.50",
      taxAmount: "17.91",
      extraChargesTaxable: "0.00",
      extraChargesNonTaxable: "200.00",
      totalBeforeRound: "117.41",
      roundOff: "-0.41",
      // Round-off applies to the taxable side only; freight rides on top, so
      // the final total is 117 + 200 = 317 (not re-rounded).
      total: "317.00",
    });
  });

  it("non-taxable extras with paise leave paise in the final total", () => {
    const totals = computeInvoiceTotals(
      [line({ quantity: "10", unitPrice: "100", gstRate: "18" }, "intrastate")],
      {
        taxClass: "intrastate",
        extraCharges: [{ amount: "50.50", taxable: false }],
      },
    );
    // Taxable side is clean (1180), freight has paise — the total carries them.
    expect(totals).toMatchObject({
      totalBeforeRound: "1180.00",
      roundOff: "0.00",
      extraChargesNonTaxable: "50.50",
      total: "1230.50",
    });
  });

  it("mixes a taxable and a non-taxable charge on the same invoice", () => {
    const totals = computeInvoiceTotals(
      [line({ quantity: "10", unitPrice: "100", gstRate: "18" }, "intrastate")],
      {
        taxClass: "intrastate",
        extraCharges: [
          { amount: "100", taxable: true, gstRate: "18" }, // cutting
          { amount: "150", taxable: false }, // freight
        ],
      },
    );
    // Taxable 1100; tax 198 (99+99); preRound 1298; total 1298 + 150 = 1448.
    expect(totals).toMatchObject({
      taxableAmount: "1100.00",
      cgstAmount: "99.00",
      sgstAmount: "99.00",
      taxAmount: "198.00",
      extraChargesTaxable: "100.00",
      extraChargesNonTaxable: "150.00",
      totalBeforeRound: "1298.00",
      total: "1448.00",
    });
  });

  it("rejects a taxable charge that omits its gstRate", () => {
    expect(() =>
      computeInvoiceTotals(
        [
          line(
            { quantity: "10", unitPrice: "100", gstRate: "18" },
            "intrastate",
          ),
        ],
        {
          taxClass: "intrastate",
          // gstRate is optional in the type (non-taxable charges omit it),
          // but at runtime a taxable charge without one is rejected — that's
          // what this case asserts.
          extraCharges: [{ amount: "200", taxable: true }],
        },
      ),
    ).toThrow();
  });
});
