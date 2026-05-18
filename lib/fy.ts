/**
 * Indian financial year — pure helpers, no IO.
 *
 * The Indian FY runs 1 April – 31 March. An invoice's FY is derived from its
 * issue date; the FY in turn scopes the invoice-number sequence. A wrong FY
 * means a wrong invoice number on every document, so this module is kept
 * deliberately tiny and string-based — an ISO `YYYY-MM-DD` is parsed by hand
 * rather than via `new Date()`, which would drag timezone offsets in.
 *
 *   18 May 2026  → FY "26-27"  (Apr–Dec belong to the FY starting that year)
 *   31 Mar 2026  → FY "25-26"  (Jan–Mar belong to the FY that started last year)
 *    1 Apr 2026  → FY "26-27"
 */

interface IsoParts {
  year: number;
  /** 1-indexed: January = 1, April = 4. */
  month: number;
  day: number;
}

/** Strict parse of a `YYYY-MM-DD` string. Throws on anything else. */
function parseIsoDate(iso: string): IsoParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`financial year: expected YYYY-MM-DD, got "${iso}"`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * The full calendar years the FY containing `iso` spans. April–December map
 * to the FY that started that calendar year; January–March map to the FY
 * that started the previous calendar year.
 */
export function financialYearBounds(iso: string): {
  startYear: number;
  endYear: number;
} {
  const { month, year } = parseIsoDate(iso);
  const startYear = month >= 4 ? year : year - 1;
  return { startYear, endYear: startYear + 1 };
}

/** Last two digits, always 2-wide ("07", "26"). */
function yy(year: number): string {
  return String(((year % 100) + 100) % 100).padStart(2, "0");
}

/**
 * The FY label printed inside invoice numbers, e.g. `"26-27"` for any date
 * from 1 Apr 2026 to 31 Mar 2027.
 */
export function financialYear(iso: string): string {
  const { startYear, endYear } = financialYearBounds(iso);
  return `${yy(startYear)}-${yy(endYear)}`;
}

/**
 * The inclusive `[start, end]` ISO date range of the FY containing `iso` —
 * 1 April … 31 March. Used to scope the per-FY invoice-number count.
 */
export function financialYearDateRange(iso: string): {
  start: string;
  end: string;
} {
  const { startYear, endYear } = financialYearBounds(iso);
  return { start: `${startYear}-04-01`, end: `${endYear}-03-31` };
}
