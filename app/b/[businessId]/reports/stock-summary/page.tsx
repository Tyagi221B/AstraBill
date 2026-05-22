import Link from "next/link";
import type { Metadata } from "next";
import Decimal from "decimal.js";

import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getStockSummary } from "@/lib/services/reports";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Stock Summary · AstraBill" };

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function StockSummaryPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const rows = await getStockSummary({ userId: user.id, businessId });
  let totalValue = new Decimal(0);
  let lowStockCount = 0;
  for (const r of rows) {
    totalValue = totalValue.plus(r.stockValue);
    if (
      r.item.enableLowStockWarning &&
      r.item.lowStockThreshold !== null &&
      new Decimal(r.closingStock).lt(r.item.lowStockThreshold)
    )
      lowStockCount += 1;
  }

  return (
    <>
      <PageHeader
        title="Stock Summary"
        description={
          <Link href={b.reports} className="text-muted-foreground hover:underline">
            ← All reports
          </Link>
        }
      />
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Total stock value" value={inr(totalValue.toFixed(2))} />
        <Kpi label="Products tracked" value={String(rows.length)} />
        <Kpi
          label="Low stock"
          value={String(lowStockCount)}
          tone={lowStockCount > 0 ? "warning" : "neutral"}
        />
      </section>

      <Card>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No products yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">HSN</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Closing stock
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    Stock value
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const low =
                    r.item.enableLowStockWarning &&
                    r.item.lowStockThreshold !== null &&
                    new Decimal(r.closingStock).lt(r.item.lowStockThreshold);
                  return (
                    <tr key={r.item.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={b.item(r.item.id)}
                          className="hover:underline"
                        >
                          {r.item.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {r.item.hsnSacCode ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${
                          low ? "text-red-700 dark:text-red-400" : ""
                        }`}
                      >
                        {r.closingStock}{" "}
                        {r.item.measuringUnitCode && (
                          <span className="text-xs text-muted-foreground">
                            {r.item.measuringUnitCode}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {inr(r.stockValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
