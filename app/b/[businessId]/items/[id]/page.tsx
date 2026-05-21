/**
 * /b/[businessId]/items/[id] — item detail.
 *
 * Current stock comes from `item_stock_movements` (the latest row's
 * closing_stock_after cache). The movements list below is the chronological
 * stock ledger — opening_stock, manual_adjustments, and (later) sale /
 * purchase / return movements driven by document finalise.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Decimal from "decimal.js";

import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { ItemStockMovement } from "@/lib/db/schema";
import { getItem } from "@/lib/services/items";
import {
  getCurrentStockForItem,
  listMovementsForItem,
} from "@/lib/repositories/item-stock-movements";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";
import { AdjustStockModal } from "./AdjustStockModal";
import { DeleteItemButton } from "./DeleteItemButton";

export const metadata: Metadata = { title: "Item · AstraBill" };

const TXN_LABEL: Record<ItemStockMovement["txnType"], string> = {
  opening_stock: "Opening stock",
  sale: "Sale",
  purchase: "Purchase",
  manual_adjustment: "Manual adjustment",
  sales_return: "Sales return",
  purchase_return: "Purchase return",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
};

function fmtGst(rate: string | null): string {
  if (rate === null) return "Exempt";
  if (Number(rate) === 0) return "0%";
  return `${Number(rate)}%`;
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;
  const item = await getItem(id, user.id);
  if (!item || item.businessId !== businessId) notFound();
  const b = routes.b(businessId);

  const isProduct = item.type === "product";
  const currentStock = isProduct ? await getCurrentStockForItem(item.id) : "0";
  const movements = isProduct ? await listMovementsForItem(item.id, 50) : [];

  const lowStock =
    isProduct &&
    item.enableLowStockWarning &&
    item.lowStockThreshold !== null &&
    new Decimal(currentStock).lt(item.lowStockThreshold);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span>{item.name}</span>
            <Badge tone={item.type === "service" ? "info" : "neutral"}>
              {item.type}
            </Badge>
            {item.code && (
              <span className="font-mono text-sm text-muted-foreground">
                {item.code}
              </span>
            )}
          </span>
        }
        action={
          <>
            {isProduct && (
              <AdjustStockModal
                itemId={item.id}
                unitCode={item.measuringUnitCode}
                currentStock={currentStock}
              />
            )}
            <Link
              href={b.editItem(item.id)}
              className={buttonClasses("outline", "sm")}
            >
              Edit
            </Link>
            <DeleteItemButton itemId={item.id} businessId={businessId} />
          </>
        }
      />

      {isProduct && (
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi
            label="Current stock"
            value={`${Number(currentStock).toLocaleString("en-IN")} ${
              item.measuringUnitCode ?? ""
            }`.trim()}
            tone={lowStock ? "warning" : "neutral"}
            hint={lowStock ? "Below threshold" : undefined}
          />
          <Kpi
            label="Sales price"
            value={item.salesPrice ? `₹ ${item.salesPrice}` : "—"}
            hint={item.salesPriceIncludesTax ? "Incl. tax" : "Pre-tax"}
          />
          <Kpi
            label="Purchase price"
            value={item.purchasePrice ? `₹ ${item.purchasePrice}` : "—"}
            hint={item.purchasePriceIncludesTax ? "Incl. tax" : "Pre-tax"}
          />
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">General</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              <Field label="Type" value={item.type} capitalize />
              <Field
                label={isProduct ? "HSN code" : "SAC code"}
                value={item.hsnSacCode}
                mono
              />
              <Field label="GST rate" value={fmtGst(item.gstRate)} />
              <Field
                label="Unit"
                value={item.measuringUnitCode}
                mono
              />
              <Field
                label="Alternative unit"
                value={item.alternativeUnitCode}
                mono
              />
              <Field
                label="Description"
                value={item.description}
                className="sm:col-span-2"
              />
            </dl>
          </CardContent>
        </Card>

        {isProduct && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 text-base font-semibold">Stock settings</h2>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
                <Field
                  label="Opening stock"
                  value={item.openingStock}
                />
                <Field
                  label="As of date"
                  value={item.openingStockAsOfDate}
                />
                <Field
                  label="Low-stock warning"
                  value={item.enableLowStockWarning ? "Enabled" : "Disabled"}
                />
                <Field
                  label="Low-stock threshold"
                  value={item.lowStockThreshold}
                />
              </dl>
            </CardContent>
          </Card>
        )}
      </div>

      {isProduct && (
        <Card className="mt-5">
          <CardContent className="px-0">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <h2 className="text-base font-semibold">Stock movements</h2>
              <span className="text-xs text-muted-foreground">
                Latest {movements.length}
              </span>
            </div>
            {movements.length === 0 ? (
              <div className="px-5 pb-8 pt-2 text-center text-sm text-muted-foreground">
                No movements yet. Add opening stock or use Adjust Stock.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-5 py-2 font-medium">Type</th>
                    <th className="px-5 py-2 text-right font-medium">Qty</th>
                    <th className="px-5 py-2 text-right font-medium">
                      Closing
                    </th>
                    <th className="px-5 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const qty = new Decimal(m.qty);
                    const isIn = qty.gte(0);
                    return (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-5 py-3 tabular-nums text-muted-foreground">
                          {m.txnDate}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {TXN_LABEL[m.txnType]}
                        </td>
                        <td
                          className={`px-5 py-3 text-right tabular-nums ${
                            isIn
                              ? "text-green-700 dark:text-green-400"
                              : "text-red-700 dark:text-red-400"
                          }`}
                        >
                          {isIn ? "+" : ""}
                          {m.qty}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {m.closingStockAfter ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {m.notes ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Field({
  label,
  value,
  mono,
  capitalize,
  className,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  capitalize?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={[
          "mt-0.5",
          mono ? "font-mono" : "",
          capitalize ? "capitalize" : "",
          value ? "text-foreground" : "",
        ].join(" ")}
      >
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
