/**
 * Invoice fixtures — typed sample payloads for iterating on PDF templates
 * without touching the database.
 *
 * Each fixture is a full `RenderRequest`, so `tsc` validates it against the
 * contract; if the contract drifts, these stop compiling. The pdf-service
 * and the in-app `/i/preview` route both render from these. Money is plausible
 * and roughly GST-consistent — exact correctness is `lib/gst.ts`'s job in the
 * real flow; here it just needs to look right.
 *
 * The business across all three is Om Glass Enterprises (Roorkee, Uttarakhand)
 * — the first customer, a glass + hardware trading shop. See
 * wiki/customer/hardware-shop-owner.md.
 */
import type { BrandingPayload, RenderRequest } from "./contract";

// Default branding — Modern template, AstraBill blue, free-plan footer on.
const MODERN_FREE: BrandingPayload = {
  logoUrl: null,
  color: "#2563eb",
  font: "inter",
  template: "modern",
  showFooterMark: true,
  columns: {
    hsn: true,
    batch: false,
    mfg: false,
    exp: false,
    discount: true,
    tax: true,
    secondaryQty: true,
  },
};

const OM_GLASS = {
  name: "Om Glass Enterprises",
  gstin: "05ABCDE1234F1Z5",
  address: "Shop 14, Civil Lines, Near Tehsil\nRoorkee, Uttarakhand 247667",
  stateCode: "05",
  phone: "98765 43210",
  email: "omglass.roorkee@gmail.com",
  bank: {
    name: "State Bank of India",
    accountNumber: "30425224353",
    ifsc: "SBIN0001703",
    accountHolder: "Om Glass Enterprises",
    upiId: "omglass@sbi",
  },
} as const;

/**
 * Fixture 1 — SMALL. Cash receipt, walk-in customer, two lines, intrastate,
 * no ship-to, no extra charges. The "simplest invoice the product emits" —
 * proves the template doesn't fall apart with sparse data.
 */
export const fixtureSmall: RenderRequest = {
  branding: MODERN_FREE,
  invoice: {
    number: "CR/26-27/0043",
    type: "cash_receipt",
    status: "paid",
    issueDate: "2026-05-12",
    dueDate: null,
    business: OM_GLASS,
    billTo: {
      name: "Walk-in customer",
      gstin: null,
      address: null,
      phone: null,
      stateCode: "05",
    },
    shipTo: null,
    lineItems: [
      {
        description: "Mirror 4mm — 2 ft × 3 ft",
        hsnCode: "7009",
        quantity: "2",
        unit: "pcs",
        secondaryQuantity: null,
        secondaryUnit: null,
        unitPrice: "450.00",
        discountAmount: "0.00",
        gstRate: "18",
        amount: "900.00",
      },
      {
        description: "Glass cleaner spray bottle 500ml",
        hsnCode: "3402",
        quantity: "1",
        unit: "pcs",
        secondaryQuantity: null,
        secondaryUnit: null,
        unitPrice: "120.00",
        discountAmount: "0.00",
        gstRate: "18",
        amount: "120.00",
      },
    ],
    extraCharges: [],
    hsnSummary: [
      {
        hsnCode: "7009",
        taxableValue: "900.00",
        cgstRate: "9",
        cgstAmount: "81.00",
        sgstRate: "9",
        sgstAmount: "81.00",
        igstRate: "",
        igstAmount: "",
      },
      {
        hsnCode: "3402",
        taxableValue: "120.00",
        cgstRate: "9",
        cgstAmount: "10.80",
        sgstRate: "9",
        sgstAmount: "10.80",
        igstRate: "",
        igstAmount: "",
      },
    ],
    totals: {
      subtotal: "1020.00",
      discountAmount: "0.00",
      extraChargesTaxable: "0.00",
      extraChargesNonTaxable: "0.00",
      taxableAmount: "1020.00",
      cgstAmount: "91.80",
      sgstAmount: "91.80",
      igstAmount: "0.00",
      roundOff: "0.40",
      total: "1204.00",
      totalInWords: "One Thousand Two Hundred Four Rupees Only",
      taxClass: "intrastate",
    },
    transport: { mode: null, vehicleNumber: null, ewayBillNumber: null },
    notes: null,
    terms: null,
  },
};

/**
 * Fixture 2 — MEDIUM. Tax invoice, saved customer, four lines, intrastate
 * (CGST + SGST), with a per-line discount, notes, and business T&C. The
 * "typical invoice" — what the template is tuned for.
 */
export const fixtureMedium: RenderRequest = {
  branding: MODERN_FREE,
  invoice: {
    number: "INV/26-27/0118",
    type: "tax_invoice",
    status: "sent",
    issueDate: "2026-05-14",
    dueDate: "2026-05-29",
    business: OM_GLASS,
    billTo: {
      name: "Agarwal Distributors",
      gstin: "05AAGCA9438G1ZP",
      address: "12 Rajendra Nagar, Industrial Area\nRoorkee, Uttarakhand 247667",
      phone: "88997 76655",
      stateCode: "05",
    },
    shipTo: null,
    lineItems: [
      {
        description: "Toughened glass 8mm — table top, polished edge",
        hsnCode: "7007",
        quantity: "3",
        unit: "pcs",
        secondaryQuantity: null,
        secondaryUnit: null,
        unitPrice: "1850.00",
        discountAmount: "150.00",
        gstRate: "18",
        amount: "5400.00",
      },
      {
        description: "Aluminium channel — 10 ft section",
        hsnCode: "7604",
        quantity: "12",
        unit: "pcs",
        secondaryQuantity: null,
        secondaryUnit: null,
        unitPrice: "210.00",
        discountAmount: "0.00",
        gstRate: "18",
        amount: "2520.00",
      },
      {
        description: "Door handle — brushed steel, pair",
        hsnCode: "8302",
        quantity: "6",
        unit: "set",
        secondaryQuantity: null,
        secondaryUnit: null,
        unitPrice: "320.00",
        discountAmount: "0.00",
        gstRate: "18",
        amount: "1920.00",
      },
      {
        description: "Silicone sealant — clear, 280ml cartridge",
        hsnCode: "3214",
        quantity: "8",
        unit: "pcs",
        secondaryQuantity: null,
        secondaryUnit: null,
        unitPrice: "145.00",
        discountAmount: "0.00",
        gstRate: "18",
        amount: "1160.00",
      },
    ],
    extraCharges: [],
    hsnSummary: [
      {
        hsnCode: "7007",
        taxableValue: "5400.00",
        cgstRate: "9",
        cgstAmount: "486.00",
        sgstRate: "9",
        sgstAmount: "486.00",
        igstRate: "",
        igstAmount: "",
      },
      {
        hsnCode: "7604",
        taxableValue: "2520.00",
        cgstRate: "9",
        cgstAmount: "226.80",
        sgstRate: "9",
        sgstAmount: "226.80",
        igstRate: "",
        igstAmount: "",
      },
      {
        hsnCode: "8302",
        taxableValue: "1920.00",
        cgstRate: "9",
        cgstAmount: "172.80",
        sgstRate: "9",
        sgstAmount: "172.80",
        igstRate: "",
        igstAmount: "",
      },
      {
        hsnCode: "3214",
        taxableValue: "1160.00",
        cgstRate: "9",
        cgstAmount: "104.40",
        sgstRate: "9",
        sgstAmount: "104.40",
        igstRate: "",
        igstAmount: "",
      },
    ],
    totals: {
      subtotal: "11150.00",
      discountAmount: "150.00",
      extraChargesTaxable: "0.00",
      extraChargesNonTaxable: "0.00",
      taxableAmount: "11000.00",
      cgstAmount: "990.00",
      sgstAmount: "990.00",
      igstAmount: "0.00",
      roundOff: "0.00",
      total: "12980.00",
      totalInWords: "Twelve Thousand Nine Hundred Eighty Rupees Only",
      taxClass: "intrastate",
    },
    transport: { mode: null, vehicleNumber: null, ewayBillNumber: null },
    notes: "Glass tops to be collected from shop. Handle with care.",
    terms:
      "Payment due within 15 days. Goods once sold will not be taken back. "
      + "Interest @18% p.a. on overdue amounts. Subject to Roorkee jurisdiction.",
  },
};

/**
 * Fixture 3 — COMPLEX. Tax invoice, interstate (IGST), dual-unit glass lines
 * (billed per sq.m, counted in pcs), a separate ship-to, taxable + non-taxable
 * extra charges, full transport block with e-way bill. The "stress test" —
 * every optional block populated, the table at its widest.
 */
export const fixtureComplex: RenderRequest = {
  branding: MODERN_FREE,
  invoice: {
    number: "INV/26-27/0119",
    type: "tax_invoice",
    status: "sent",
    issueDate: "2026-05-15",
    dueDate: "2026-06-14",
    business: OM_GLASS,
    billTo: {
      name: "Skyline Interiors Pvt Ltd",
      gstin: "07AABCS1429R1Z8",
      address: "401 Connaught Circus, Block B\nNew Delhi, Delhi 110001",
      phone: "98110 22334",
      stateCode: "07",
    },
    shipTo: {
      name: "Skyline Interiors — Gurugram site office",
      address: "Tower C, DLF Cyber City, Phase 2\nGurugram, Haryana 122002",
    },
    lineItems: [
      {
        description: "Clear float glass 5mm — cut to size",
        hsnCode: "7005",
        quantity: "11.34",
        unit: "sqm",
        secondaryQuantity: "4",
        secondaryUnit: "pcs",
        unitPrice: "640.00",
        discountAmount: "0.00",
        gstRate: "18",
        amount: "7257.60",
      },
      {
        description: "Frosted glass 6mm — partition panels",
        hsnCode: "7005",
        quantity: "6.20",
        unit: "sqm",
        secondaryQuantity: "3",
        secondaryUnit: "pcs",
        unitPrice: "880.00",
        discountAmount: "0.00",
        gstRate: "18",
        amount: "5456.00",
      },
      {
        description: "Glass-to-glass hinge — heavy duty",
        hsnCode: "8302",
        quantity: "16",
        unit: "pcs",
        secondaryQuantity: null,
        secondaryUnit: null,
        unitPrice: "275.00",
        discountAmount: "200.00",
        gstRate: "18",
        amount: "4200.00",
      },
    ],
    extraCharges: [
      { label: "Cutting & edge polishing", amount: "1200.00", taxable: true, gstRate: "18" },
      { label: "Freight to Gurugram site", amount: "1500.00", taxable: false, gstRate: null },
    ],
    hsnSummary: [
      {
        hsnCode: "7005",
        taxableValue: "13913.60",
        cgstRate: "",
        cgstAmount: "",
        sgstRate: "",
        sgstAmount: "",
        igstRate: "18",
        igstAmount: "2504.45",
      },
      {
        hsnCode: "8302",
        taxableValue: "4200.00",
        cgstRate: "",
        cgstAmount: "",
        sgstRate: "",
        sgstAmount: "",
        igstRate: "18",
        igstAmount: "756.00",
      },
      {
        hsnCode: "9988",
        taxableValue: "1200.00",
        cgstRate: "",
        cgstAmount: "",
        sgstRate: "",
        sgstAmount: "",
        igstRate: "18",
        igstAmount: "216.00",
      },
    ],
    totals: {
      subtotal: "18913.60",
      discountAmount: "200.00",
      extraChargesTaxable: "1200.00",
      extraChargesNonTaxable: "1500.00",
      taxableAmount: "19313.60",
      cgstAmount: "0.00",
      sgstAmount: "0.00",
      igstAmount: "3476.45",
      roundOff: "-0.05",
      total: "24290.00",
      totalInWords: "Twenty Four Thousand Two Hundred Ninety Rupees Only",
      taxClass: "interstate",
    },
    transport: {
      mode: "Road",
      vehicleNumber: "UK 08 CG 4521",
      ewayBillNumber: "381004927615",
    },
    notes:
      "Site delivery between 10am–4pm. Call site office 30 min before arrival.",
    terms:
      "Payment due within 30 days. Interest @18% p.a. on overdue amounts. "
      + "Breakage in transit is the buyer's risk once goods leave the shop. "
      + "Subject to Roorkee jurisdiction.",
  },
};

/**
 * Fixture 4 — LONG. Tax invoice, 22 line items, intrastate. Deliberately
 * overflows one A4 page — the multi-page stress test. Verifies the table
 * header repeats, no row splits, and the summary / HSN / bank / terms
 * blocks land whole on the continuation page.
 */
const LONG_ITEMS: ReadonlyArray<[string, string, string, string, string]> = [
  // [description, hsn, qty, unitPrice, amount]
  ["Wood screws 2\" — zinc plated", "7318", "500", "2.40", "1200.00"],
  ["Door hinge 4\" — stainless steel", "8302", "50", "17.00", "850.00"],
  ["Mortice lock set — brass", "8302", "8", "300.00", "2400.00"],
  ["L-bracket — 3 inch", "7318", "100", "6.00", "600.00"],
  ["Emulsion paint — white, 4 litre", "3208", "5", "350.00", "1750.00"],
  ["Sandpaper sheets — assorted grit", "3208", "200", "4.90", "980.00"],
  ["Plywood 18mm — 8 ft × 4 ft", "4412", "4", "800.00", "3200.00"],
  ["Wall plug pack — 8mm", "7318", "30", "15.00", "450.00"],
  ["Tower bolt 6\" — chrome", "8302", "22", "50.00", "1100.00"],
  ["Aldrop — heavy duty", "8302", "25", "110.00", "2750.00"],
  ["Hacksaw blade — bi-metal", "8202", "60", "12.00", "720.00"],
  ["PVC pipe 1\" — 10 ft length", "7307", "38", "50.00", "1900.00"],
  ["Pipe elbow 1\" — PVC", "7307", "60", "9.00", "540.00"],
  ["Teflon tape — roll", "3919", "150", "9.00", "1350.00"],
  ["Cabinet handle — stainless steel", "8302", "42", "50.00", "2100.00"],
  ["Drawer slide — pair, 18 inch", "8302", "16", "55.00", "880.00"],
  ["Gate latch — galvanised", "8302", "32", "50.00", "1600.00"],
  ["Curtain bracket — adjustable", "8302", "90", "11.00", "990.00"],
  ["Door closer — hydraulic", "8302", "10", "230.00", "2300.00"],
  ["Magnetic catch — small", "8302", "95", "8.00", "760.00"],
  ["Glass clamp — D-shape", "8302", "29", "50.00", "1450.00"],
  ["Rubber beading — 50 m roll", "4016", "8", "160.00", "1280.00"],
];

export const fixtureLong: RenderRequest = {
  branding: MODERN_FREE,
  invoice: {
    number: "INV/26-27/0120",
    type: "tax_invoice",
    status: "sent",
    issueDate: "2026-05-16",
    dueDate: "2026-05-31",
    business: OM_GLASS,
    billTo: {
      name: "Bansal Builders & Contractors",
      gstin: "05AABCB7711K1Z2",
      address: "Plot 9, Ramnagar Industrial Estate\nHaridwar, Uttarakhand 249403",
      phone: "94120 55667",
      stateCode: "05",
    },
    shipTo: null,
    lineItems: LONG_ITEMS.map(
      ([description, hsnCode, quantity, unitPrice, amount]) => ({
        description,
        hsnCode,
        quantity,
        unit: "pcs",
        secondaryQuantity: null,
        secondaryUnit: null,
        unitPrice,
        discountAmount: "0.00",
        gstRate: "18",
        amount,
      }),
    ),
    extraCharges: [],
    hsnSummary: [
      {
        hsnCode: "7318",
        taxableValue: "8200.00",
        cgstRate: "9",
        cgstAmount: "738.00",
        sgstRate: "9",
        sgstAmount: "738.00",
        igstRate: "",
        igstAmount: "",
      },
      {
        hsnCode: "8302",
        taxableValue: "9650.00",
        cgstRate: "9",
        cgstAmount: "868.50",
        sgstRate: "9",
        sgstAmount: "868.50",
        igstRate: "",
        igstAmount: "",
      },
      {
        hsnCode: "3208",
        taxableValue: "7300.00",
        cgstRate: "9",
        cgstAmount: "657.00",
        sgstRate: "9",
        sgstAmount: "657.00",
        igstRate: "",
        igstAmount: "",
      },
      {
        hsnCode: "7307",
        taxableValue: "6000.00",
        cgstRate: "9",
        cgstAmount: "540.00",
        sgstRate: "9",
        sgstAmount: "540.00",
        igstRate: "",
        igstAmount: "",
      },
    ],
    totals: {
      subtotal: "31150.00",
      discountAmount: "0.00",
      extraChargesTaxable: "0.00",
      extraChargesNonTaxable: "0.00",
      taxableAmount: "31150.00",
      cgstAmount: "2803.50",
      sgstAmount: "2803.50",
      igstAmount: "0.00",
      roundOff: "0.00",
      total: "36757.00",
      totalInWords: "Thirty Six Thousand Seven Hundred Fifty Seven Rupees Only",
      taxClass: "intrastate",
    },
    transport: { mode: "Road", vehicleNumber: "UK 08 BG 7240", ewayBillNumber: null },
    notes: "Delivery in two trips. Second trip after the paint stock arrives.",
    terms:
      "Payment due within 15 days. Goods once sold will not be taken back. "
      + "Interest @18% p.a. on overdue amounts. Subject to Roorkee jurisdiction.",
  },
};

/** All fixtures, keyed — the preview route + pdf-service tests iterate this. */
export const fixtures = {
  small: fixtureSmall,
  medium: fixtureMedium,
  complex: fixtureComplex,
  long: fixtureLong,
} as const;

export type FixtureKey = keyof typeof fixtures;
