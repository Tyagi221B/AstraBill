import Link from "next/link";
import type { Metadata } from "next";

import {
  DateRangeFilter,
  currentFyBounds,
} from "@/components/app/DateRangeFilter";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getHsnSummary } from "@/lib/services/reports";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "HSN Summary · AstraBill" };

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function HsnSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string; side?: "sales" | "purchase" }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const sp = await searchParams;
  const fy = currentFyBounds();
  const from = sp.from ?? fy.from;
  const to = sp.to ?? fy.to;
  const side = sp.side ?? "sales";
  const b = routes.b(businessId);

  const rows = await getHsnSummary({
    userId: user.id,
    businessId,
    from,
    to,
    side,
  });

  return (
    <>
      <PageHeader
        title="HSN Summary"
        description={
          <Link href={b.reports} className="text-muted-foreground hover:underline">
            ← All reports
          </Link>
        }
        action={
          <div className="flex gap-2">
            {(["sales", "purchase"] as const).map((s) => (
              <Link
                key={s}
                href={`?side=${s}&from=${from}&to=${to}`}
                className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                  side === s
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:border-ring"
                }`}
              >
                {s}
              </Link>
            ))}
          </div>
        }
      />
      <DateRangeFilter initialFrom={from} initialTo={to} />

      <Card>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No HSN-tagged lines in this period.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">HSN/SAC</th>
                  <th className="px-4 py-2 font-medium">Rate</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Taxable</th>
                  <th className="px-4 py-2 text-right font-medium">CGST</th>
                  <th className="px-4 py-2 text-right font-medium">SGST</th>
                  <th className="px-4 py-2 text-right font-medium">IGST</th>
                  <th className="px-4 py-2 text-right font-medium">Total tax</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.hsnCode}-${r.gstRate}-${i}`} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs">{r.hsnCode}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.gstRate === null
                        ? "Exempt"
                        : Number(r.gstRate) === 0
                          ? "0%"
                          : `${Number(r.gstRate)}%`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.totalQty}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.taxableAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.cgstAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.sgstAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.igstAmount)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{inr(r.totalTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
