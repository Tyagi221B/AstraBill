/**
 * Display formatters. The contract hands the renderer money as strings and
 * dates as ISO — these turn them into what a customer should read.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Indian-grouped rupee string: 1234567.5 → "₹12,34,567.50".
 * Last three digits, then groups of two — the Indian numbering convention.
 * Returns the input untouched if it isn't a finite number.
 */
export function formatInr(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;

  const negative = n < 0;
  const fixed = Math.abs(n).toFixed(2); // always "N.NN"
  const dot = fixed.indexOf(".");
  const intPart = fixed.slice(0, dot);
  const decPart = fixed.slice(dot + 1);

  let grouped: string;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    let rest = intPart.slice(0, -3);
    const groups: string[] = [];
    while (rest.length > 2) {
      groups.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest) groups.unshift(rest);
    grouped = `${groups.join(",")},${last3}`;
  } else {
    grouped = intPart;
  }

  return `${negative ? "-" : ""}₹${grouped}.${decPart}`;
}

/**
 * Trim trailing decimal zeros: "1.000" → "1", "12.000" → "12", "11.34"
 * stays, "6.20" → "6.2", "18.00" → "18". Integers without a "." are
 * untouched. Used for quantities and GST rates — NUMERIC(12,3)/(5,2)
 * columns arrive zero-padded.
 */
export function trimNumber(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

/** ISO date (YYYY-MM-DD) → "14 May 2026". Returns input on a parse miss. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, year, month, day] = m;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return iso;
  return `${day} ${monthName} ${year}`;
}
