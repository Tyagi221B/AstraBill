import { describe, expect, it } from "vitest";

import {
  financialYear,
  financialYearBounds,
  financialYearDateRange,
} from "./fy";

describe("financialYear", () => {
  it("maps a mid-year date to the FY that started that April", () => {
    // The date 'today' falls on while building this — 18 May 2026 is FY 26-27.
    expect(financialYear("2026-05-18")).toBe("26-27");
  });

  it("April–December belong to the FY starting that calendar year", () => {
    expect(financialYear("2026-04-01")).toBe("26-27");
    expect(financialYear("2026-12-31")).toBe("26-27");
    expect(financialYear("2025-08-15")).toBe("25-26");
  });

  it("January–March belong to the FY that started the previous year", () => {
    expect(financialYear("2026-01-01")).toBe("25-26");
    expect(financialYear("2026-02-28")).toBe("25-26");
    expect(financialYear("2026-03-31")).toBe("25-26");
  });

  it("flips exactly on the 31 Mar / 1 Apr boundary", () => {
    expect(financialYear("2027-03-31")).toBe("26-27");
    expect(financialYear("2027-04-01")).toBe("27-28");
  });

  it("pads the two-digit years, including century rollover", () => {
    expect(financialYear("2000-04-01")).toBe("00-01");
    expect(financialYear("1999-12-31")).toBe("99-00");
    expect(financialYear("2009-03-31")).toBe("08-09");
  });

  it("rejects anything that is not a strict YYYY-MM-DD", () => {
    expect(() => financialYear("2026-5-1")).toThrow();
    expect(() => financialYear("18-05-2026")).toThrow();
    expect(() => financialYear("not a date")).toThrow();
    expect(() => financialYear("")).toThrow();
  });
});

describe("financialYearBounds", () => {
  it("returns the calendar years the FY spans", () => {
    expect(financialYearBounds("2026-04-01")).toEqual({
      startYear: 2026,
      endYear: 2027,
    });
    expect(financialYearBounds("2026-03-31")).toEqual({
      startYear: 2025,
      endYear: 2026,
    });
  });
});

describe("financialYearDateRange", () => {
  it("returns the inclusive 1 Apr – 31 Mar window", () => {
    expect(financialYearDateRange("2026-05-18")).toEqual({
      start: "2026-04-01",
      end: "2027-03-31",
    });
  });

  it("resolves a Jan–Mar date to the window that opened the prior April", () => {
    expect(financialYearDateRange("2026-02-10")).toEqual({
      start: "2025-04-01",
      end: "2026-03-31",
    });
  });
});
