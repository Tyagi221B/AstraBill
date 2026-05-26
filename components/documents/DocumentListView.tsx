/**
 * DocumentListView — shared server-rendered list table for any doc type.
 *
 * KPIs at the top vary slightly by doc type:
 *   - financial doc types (sales/purchase invoice, credit/debit note)
 *     show Total billed / Unpaid / Drafts / Cancelled.
 *   - non-financial (quotation, estimate, delivery_challan, proforma)
 *     show Total count / Drafts / Finalised / Cancelled.
 */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import Decimal from "decimal.js";

import { EmptyState } from "@/components/app/EmptyState";
import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { Document } from "@/lib/db/schema";

const STATUS_TONE: Record<
  Document["status"],
  "neutral" | "info" | "success" | "warning" | "destructive"
> = {
  draft: "neutral",
  unpaid: "warning",
  partial_paid: "info",
  paid: "success",
  cancelled: "destructive",
};

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function DocumentListView({
  title,
  pluralNoun,
  singularNoun,
  newCtaHref,
  detailHref,
  emptyIcon,
  emptyDescription,
  documents,
  isFinancial,
}: {
  title: string;
  pluralNoun: string;
  singularNoun: string;
  newCtaHref: string;
  detailHref: (docId: string) => string;
  emptyIcon: LucideIcon;
  emptyDescription: string;
  documents: Document[];
  /** Financial doc types show Total billed / Unpaid; others show count splits. */
  isFinancial: boolean;
}) {
  let totalBilled = new Decimal(0);
  let unpaidValue = new Decimal(0);
  const counts = { draft: 0, unpaid: 0, partial_paid: 0, paid: 0, cancelled: 0 };
  for (const d of documents) {
    counts[d.status] += 1;
    if (d.status !== "draft" && d.status !== "cancelled") {
      totalBilled = totalBilled.plus(d.grandTotal);
      if (d.status === "unpaid" || d.status === "partial_paid") {
        unpaidValue = unpaidValue.plus(
          new Decimal(d.grandTotal).sub(d.amountReceived),
        );
      }
    }
  }

  return (
    <>
      <PageHeader
        title={title}
        description={`${documents.length} ${
          documents.length === 1 ? singularNoun : pluralNoun
        }`}
        action={
          <Link href={newCtaHref} className={buttonClasses("primary", "sm")}>
            + New {singularNoun}
          </Link>
        }
      />

      {documents.length > 0 && (
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          {isFinancial ? (
            <>
              <Kpi label="Total" value={inr(totalBilled.toFixed(2))} />
              <Kpi
                label="Unpaid"
                value={inr(unpaidValue.toFixed(2))}
                tone={unpaidValue.gt(0) ? "warning" : "neutral"}
              />
              <Kpi label="Drafts" value={String(counts.draft)} />
              <Kpi label="Cancelled" value={String(counts.cancelled)} />
            </>
          ) : (
            <>
              <Kpi label="Total" value={String(documents.length)} />
              <Kpi label="Drafts" value={String(counts.draft)} />
              <Kpi
                label="Finalised"
                value={String(
                  counts.unpaid + counts.partial_paid + counts.paid,
                )}
              />
              <Kpi label="Cancelled" value={String(counts.cancelled)} />
            </>
          )}
        </section>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={emptyIcon}
          title={`No ${pluralNoun} yet`}
          description={emptyDescription}
          action={
            <Link href={newCtaHref} className={buttonClasses("primary", "sm")}>
              + New {singularNoun}
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
                    <th className="px-4 py-3 font-medium">Number</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    {isFinancial && (
                      <th className="px-4 py-3 text-right font-medium">
                        Balance
                      </th>
                    )}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => {
                    const balance = new Decimal(d.grandTotal)
                      .sub(d.amountReceived)
                      .toFixed(2);
                    const isDraft = d.status === "draft";
                    const isCancelled = d.status === "cancelled";
                    return (
                      <tr
                        key={d.id}
                        className="border-t border-border text-foreground"
                      >
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={detailHref(d.id)}
                            className="hover:underline"
                          >
                            {d.docNumber ?? (
                              <span className="italic text-muted-foreground">
                                Draft
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {d.docDate}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONE[d.status]}>
                            {d.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {inr(d.grandTotal)}
                        </td>
                        {isFinancial && (
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {isDraft || isCancelled || Number(balance) <= 0 ? (
                              <span className="text-muted-foreground">
                                {isDraft ? "—" : isCancelled ? "—" : "Paid"}
                              </span>
                            ) : (
                              <span className="text-red-700 dark:text-red-400">
                                {inr(balance)}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={detailHref(d.id)}
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
