/**
 * AgeingTable — shared bucketed-ageing table for both receivables (positive)
 * and payables (signed-positive in their own column). Renders an
 * absolute-value table; the surrounding page provides title and tone.
 */
import { Card, CardContent } from "@/components/ui/card";
import type { AgeingRow } from "@/lib/services/reports";
import Decimal from "decimal.js";

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const absInr = (n: string) =>
  `₹${Math.abs(Number(n)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function AgeingTable({ rows }: { rows: AgeingRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
          Nothing outstanding right now.
        </CardContent>
      </Card>
    );
  }
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total.plus(new Decimal(r.total).abs()),
      b0: acc.b0.plus(new Decimal(r.bucket0_30).abs()),
      b1: acc.b1.plus(new Decimal(r.bucket31_60).abs()),
      b2: acc.b2.plus(new Decimal(r.bucket61_90).abs()),
      b3: acc.b3.plus(new Decimal(r.bucket90Plus).abs()),
    }),
    {
      total: new Decimal(0),
      b0: new Decimal(0),
      b1: new Decimal(0),
      b2: new Decimal(0),
      b3: new Decimal(0),
    },
  );
  return (
    <Card>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Party</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">0-30 days</th>
                <th className="px-4 py-2 text-right font-medium">31-60</th>
                <th className="px-4 py-2 text-right font-medium">61-90</th>
                <th className="px-4 py-2 text-right font-medium">90+</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.party.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{r.party.name}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {absInr(r.total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {absInr(r.bucket0_30)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {absInr(r.bucket31_60)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {absInr(r.bucket61_90)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-400">
                    {absInr(r.bucket90Plus)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {inr(totals.total.toFixed(2))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {inr(totals.b0.toFixed(2))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {inr(totals.b1.toFixed(2))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {inr(totals.b2.toFixed(2))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-400">
                  {inr(totals.b3.toFixed(2))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
