/**
 * HSN tax summary — derived from line items at render time, never stored
 * (DECISIONS — "HSN tax summary").
 *
 * Rows are grouped by HSN code + GST rate: the same HSN billed at two rates
 * is two rows, because each row carries one rate. Per-line CGST/SGST/IGST are
 * already computed and stored — this just sums them per group.
 */
import Decimal from "decimal.js";

import type { HsnSummaryRow, TaxClass } from "./contract";

/** The line-item fields this derivation needs. */
export interface HsnLineInput {
  hsnCode: string | null;
  gstRate: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
}

function sum(values: string[]): string {
  return values
    .reduce((acc, v) => acc.plus(new Decimal(v || "0")), new Decimal(0))
    .toFixed(2);
}

/** Half a GST rate, as a trimmed string: "18" → "9", "5" → "2.5". */
function halfRate(rate: string): string {
  return new Decimal(rate || "0").dividedBy(2).toFixed(2).replace(/\.?0+$/, "");
}

export function buildHsnSummary(
  lines: HsnLineInput[],
  taxClass: TaxClass,
): HsnSummaryRow[] {
  // Preserve first-seen order of (hsn, rate) groups.
  const groups = new Map<string, HsnLineInput[]>();
  for (const line of lines) {
    const key = `${line.hsnCode ?? "—"}@${line.gstRate}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }

  const rows: HsnSummaryRow[] = [];
  for (const [key, bucket] of groups) {
    const hsnCode = key.slice(0, key.lastIndexOf("@"));
    const rate = bucket[0]!.gstRate;
    const taxableValue = sum(bucket.map((l) => l.taxableAmount));

    if (taxClass === "intrastate") {
      rows.push({
        hsnCode,
        taxableValue,
        cgstRate: halfRate(rate),
        cgstAmount: sum(bucket.map((l) => l.cgstAmount)),
        sgstRate: halfRate(rate),
        sgstAmount: sum(bucket.map((l) => l.sgstAmount)),
        igstRate: "",
        igstAmount: "",
      });
    } else {
      rows.push({
        hsnCode,
        taxableValue,
        cgstRate: "",
        cgstAmount: "",
        sgstRate: "",
        sgstAmount: "",
        igstRate: new Decimal(rate || "0").toFixed(2).replace(/\.?0+$/, ""),
        igstAmount: sum(bucket.map((l) => l.igstAmount)),
      });
    }
  }
  return rows;
}
