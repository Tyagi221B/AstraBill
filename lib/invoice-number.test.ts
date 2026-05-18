import { describe, expect, it } from "vitest";

import { buildInvoiceNumber, invoicePrefix } from "./invoice-number";

describe("invoicePrefix", () => {
  it("uses the per-type default when no custom prefix is set", () => {
    expect(invoicePrefix("tax_invoice")).toBe("INV");
    expect(invoicePrefix("estimate")).toBe("EST");
    expect(invoicePrefix("cash_receipt")).toBe("CR");
    expect(invoicePrefix("credit_note")).toBe("CN");
    expect(invoicePrefix("debit_note")).toBe("DN");
    expect(invoicePrefix("delivery_challan")).toBe("DC");
  });

  it("honours a business-set custom prefix for TAX INVOICES only", () => {
    expect(invoicePrefix("tax_invoice", "ACME")).toBe("ACME");
  });

  it("ignores the custom prefix for every other type — collision safety", () => {
    // If a custom prefix applied to every type, a tax invoice and an estimate
    // would both resolve to `ACME/26-27/0001` and trip the unique constraint.
    expect(invoicePrefix("estimate", "ACME")).toBe("EST");
    expect(invoicePrefix("cash_receipt", "ACME")).toBe("CR");
    expect(invoicePrefix("credit_note", "ACME")).toBe("CN");
    expect(invoicePrefix("debit_note", "ACME")).toBe("DN");
    expect(invoicePrefix("delivery_challan", "ACME")).toBe("DC");
  });

  it("treats blank / whitespace-only custom prefixes as 'not set'", () => {
    expect(invoicePrefix("tax_invoice", "")).toBe("INV");
    expect(invoicePrefix("tax_invoice", "   ")).toBe("INV");
    expect(invoicePrefix("tax_invoice", null)).toBe("INV");
    expect(invoicePrefix("tax_invoice", undefined)).toBe("INV");
  });

  it("trims whitespace around a real custom prefix", () => {
    expect(invoicePrefix("tax_invoice", "  ACME  ")).toBe("ACME");
  });
});

describe("buildInvoiceNumber", () => {
  it("formats `{prefix}/{FY}/{seq:0000}` for a tax invoice", () => {
    expect(
      buildInvoiceNumber({
        type: "tax_invoice",
        issueDate: "2026-05-18",
        sequence: 1,
      }),
    ).toBe("INV/26-27/0001");
  });

  it("uses each type's built-in prefix", () => {
    const at = (type: Parameters<typeof buildInvoiceNumber>[0]["type"]) =>
      buildInvoiceNumber({ type, issueDate: "2026-05-18", sequence: 7 });
    expect(at("estimate")).toBe("EST/26-27/0007");
    expect(at("cash_receipt")).toBe("CR/26-27/0007");
    expect(at("credit_note")).toBe("CN/26-27/0007");
    expect(at("debit_note")).toBe("DN/26-27/0007");
    expect(at("delivery_challan")).toBe("DC/26-27/0007");
  });

  it("zero-pads the sequence to four digits", () => {
    const at = (sequence: number) =>
      buildInvoiceNumber({
        type: "tax_invoice",
        issueDate: "2026-05-18",
        sequence,
      });
    expect(at(1)).toBe("INV/26-27/0001");
    expect(at(42)).toBe("INV/26-27/0042");
    expect(at(9999)).toBe("INV/26-27/9999");
    // Past four digits, the sequence simply widens — better that than wrap.
    expect(at(10000)).toBe("INV/26-27/10000");
  });

  it("draft created in one FY, finalised in the next → number follows the finalise date", () => {
    // Setup: a draft was scratched out on 20 Mar 2026 (FY 25-26). The user
    // didn't finalise it then; weeks later, on 10 Apr 2026 (FY 26-27), they
    // open it, update its issue date to today and hit "Mark as sent".
    //
    // The number is assigned at THAT moment from the issue date the invoice
    // carries — so it lands in the new FY's series, not the old one.

    // What the number would have been had they finalised the draft in March:
    const numberIfFinalisedInOldFy = buildInvoiceNumber({
      type: "tax_invoice",
      issueDate: "2026-03-20",
      sequence: 1,
    });
    expect(numberIfFinalisedInOldFy).toBe("INV/25-26/0001");

    // What it actually gets, finalised in April with the updated issue date:
    const numberFinalisedInNewFy = buildInvoiceNumber({
      type: "tax_invoice",
      issueDate: "2026-04-10",
      sequence: 1,
    });
    expect(numberFinalisedInNewFy).toBe("INV/26-27/0001");

    // The two share no overlap — the FY segment differs, and each series
    // starts cleanly at 0001 within its own FY.
    expect(numberFinalisedInNewFy).not.toBe(numberIfFinalisedInOldFy);
  });

  it("applies the custom prefix only to tax invoices, even in the same FY", () => {
    const inFy = (
      type: Parameters<typeof buildInvoiceNumber>[0]["type"],
      sequence: number,
    ) =>
      buildInvoiceNumber({
        type,
        issueDate: "2026-05-18",
        sequence,
        customPrefix: "ACME",
      });
    expect(inFy("tax_invoice", 1)).toBe("ACME/26-27/0001");
    // A coexisting estimate at the same sequence keeps its built-in prefix,
    // so the unique `(business_id, number)` index stays collision-free.
    expect(inFy("estimate", 1)).toBe("EST/26-27/0001");
  });

  it("rejects a non-positive or non-integer sequence", () => {
    expect(() =>
      buildInvoiceNumber({
        type: "tax_invoice",
        issueDate: "2026-05-18",
        sequence: 0,
      }),
    ).toThrow();
    expect(() =>
      buildInvoiceNumber({
        type: "tax_invoice",
        issueDate: "2026-05-18",
        sequence: -1,
      }),
    ).toThrow();
    expect(() =>
      buildInvoiceNumber({
        type: "tax_invoice",
        issueDate: "2026-05-18",
        sequence: 1.5,
      }),
    ).toThrow();
  });
});
