/**
 * /b/[businessId]/items — unified Items list (products + services).
 *
 * The new full-ledger domain's replacement for the old Products list.
 * Current stock comes from `item_stock_movements` (single source of truth),
 * never from a cached items.stock column. Stock value sums stock × purchase
 * price for products with a known cost.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { Package } from "lucide-react";
import Decimal from "decimal.js";

import { EmptyState } from "@/components/app/EmptyState";
import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { listItemsForUser } from "@/lib/services/items";
import { getCurrentStockForItems } from "@/lib/repositories/stock-movements";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Items · AstraBill",
};

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function fmtGst(rate: string | null): string {
  if (rate === null) return "Exempt";
  if (rate === "0" || Number(rate) === 0) return "0%";
  return `${Number(rate)}%`;
}

export default async function ItemsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const items = await listItemsForUser({
    userId: user.id,
    businessId,
    limit: 500,
  });

  const stockMap = await getCurrentStockForItems(items.map((i) => i.id));

  let stockValue = new Decimal(0);
  let lowStockCount = 0;
  for (const item of items) {
    if (item.type !== "product") continue;
    const stock = new Decimal(stockMap.get(item.id) ?? "0");
    if (item.purchasePrice !== null) {
      stockValue = stockValue.plus(stock.times(item.purchasePrice));
    }
    if (
      item.enableLowStockWarning &&
      item.lowStockThreshold !== null &&
      stock.lt(item.lowStockThreshold)
    ) {
      lowStockCount += 1;
    }
  }

  const productCount = items.filter((i) => i.type === "product").length;
  const serviceCount = items.length - productCount;

  return (
    <>
      <PageHeader
        title="Items"
        description={
          <span>
            <span>{productCount}</span>{" "}
            <span className="text-muted-foreground/80">
              {productCount === 1 ? "product" : "products"}
            </span>
            {" · "}
            <span>{serviceCount}</span>{" "}
            <span className="text-muted-foreground/80">
              {serviceCount === 1 ? "service" : "services"}
            </span>
          </span>
        }
        action={
          <>
            <Link
              href={b.settings.itemCategories}
              className={buttonClasses("outline", "sm")}
            >
              Categories
            </Link>
            <Link href={b.newItem} className={buttonClasses("primary", "sm")}>
              + New item
            </Link>
          </>
        }
      />

      {items.length > 0 && (
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi label="Stock value" value={inr(stockValue.toFixed(2))} />
          <Kpi
            label="Low stock"
            value={String(lowStockCount)}
            tone={lowStockCount > 0 ? "warning" : "neutral"}
            hint={lowStockCount > 0 ? "Items below threshold" : "All good"}
          />
          <Kpi label="Total items" value={String(items.length)} />
        </section>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No items yet"
          description="Items are what you buy and sell — products with stock, or services billed by the hour. Add one to start invoicing."
          action={
            <Link
              href={b.newItem}
              className={buttonClasses("primary", "sm")}
            >
              + Add your first item
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">HSN/SAC</th>
                    <th className="px-4 py-3 font-medium">GST</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Sales price
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Stock</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const stock = stockMap.get(item.id) ?? "0";
                    const lowStock =
                      item.type === "product" &&
                      item.enableLowStockWarning &&
                      item.lowStockThreshold !== null &&
                      new Decimal(stock).lt(item.lowStockThreshold);
                    return (
                      <tr
                        key={item.id}
                        className="border-t border-border text-foreground"
                      >
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={b.item(item.id)}
                            className="hover:underline"
                          >
                            {item.name}
                          </Link>
                          {item.code && (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {item.code}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">
                          {item.type}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {item.hsnSacCode ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {fmtGst(item.gstRate)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {item.salesPrice ? `₹ ${item.salesPrice}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {item.type === "service" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                lowStock
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-foreground"
                              }
                            >
                              {Number(stock).toLocaleString("en-IN")}{" "}
                              {item.measuringUnitCode && (
                                <span className="text-xs text-muted-foreground">
                                  {item.measuringUnitCode}
                                </span>
                              )}
                              {lowStock && (
                                <Badge tone="warning" className="ml-2">
                                  low
                                </Badge>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={b.item(item.id)}
                            className="text-sm text-primary hover:underline"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
