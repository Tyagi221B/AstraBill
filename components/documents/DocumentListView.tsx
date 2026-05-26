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
import {
  AlertCircle,
  Ban,
  CircleCheck,
  PencilLine,
  TrendingUp,
} from "lucide-react";
import Decimal from "decimal.js";

import { EmptyState } from "@/components/app/EmptyState";
import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { Document } from "@/lib/db/schema";
import type { DocumentWithParty } from "@/lib/services/documents";
import { cn } from "@/lib/utils";

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

/**
 * "Due in N days" / "Overdue N days" / "Due today" — relative to the
 * caller-supplied today value (so all rows reason against the same
 * reference, no drift across a long list). Returns null if the doc has
 * no due date or the row is in a state where due-date doesn't apply
 * (paid, cancelled, draft).
 */
function dueLabel(
  doc: DocumentWithParty,
  today: string,
): { text: string; tone: "neutral" | "warning" | "danger" } | null {
  if (!doc.dueDate) return null;
  if (doc.status === "paid" || doc.status === "cancelled" || doc.status === "draft") {
    return null;
  }
  // Date arithmetic on YYYY-MM-DD strings via UTC midnight — avoids the
  // floating-timezone issues `new Date(dateString)` introduces.
  const dueMs = Date.parse(`${doc.dueDate}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    return {
      text: diffDays === 1 ? "Due tomorrow" : `Due in ${diffDays} days`,
      tone: diffDays <= 7 ? "warning" : "neutral",
    };
  }
  if (diffDays === 0) return { text: "Due today", tone: "warning" };
  const overdue = -diffDays;
  return {
    text: overdue === 1 ? "1 day overdue" : `${overdue} days overdue`,
    tone: "danger",
  };
}

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
  documents: DocumentWithParty[];
  /** Financial doc types show Total billed / Unpaid; others show count splits. */
  isFinancial: boolean;
}) {
  // Single "today" reference for every row's relative-date math, so a row
  // can't drift one day off another mid-render.
  const today = new Date().toISOString().slice(0, 10);

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
              <Kpi
                label="Total"
                value={inr(totalBilled.toFixed(2))}
                tone="brand"
                icon={TrendingUp}
              />
              <Kpi
                label="Unpaid"
                value={inr(unpaidValue.toFixed(2))}
                tone={unpaidValue.gt(0) ? "warning" : "success"}
                icon={AlertCircle}
              />
              <Kpi
                label="Drafts"
                value={String(counts.draft)}
                tone={counts.draft > 0 ? "info" : "neutral"}
                icon={PencilLine}
              />
              <Kpi
                label="Cancelled"
                value={String(counts.cancelled)}
                tone={counts.cancelled > 0 ? "danger" : "neutral"}
                icon={Ban}
              />
            </>
          ) : (
            <>
              <Kpi
                label="Total"
                value={String(documents.length)}
                tone="brand"
                icon={TrendingUp}
              />
              <Kpi
                label="Drafts"
                value={String(counts.draft)}
                tone={counts.draft > 0 ? "info" : "neutral"}
                icon={PencilLine}
              />
              <Kpi
                label="Finalised"
                value={String(
                  counts.unpaid + counts.partial_paid + counts.paid,
                )}
                tone="success"
                icon={CircleCheck}
              />
              <Kpi
                label="Cancelled"
                value={String(counts.cancelled)}
                tone={counts.cancelled > 0 ? "danger" : "neutral"}
                icon={Ban}
              />
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
                  <tr className="text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Number</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Party</th>
                    <th className="px-4 py-3">Status</th>
                    {isFinancial && <th className="px-4 py-3">Due</th>}
                    <th className="px-4 py-3 text-right">Total</th>
                    {isFinancial && (
                      <th className="px-4 py-3 text-right">Balance</th>
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
                    const due = isFinancial ? dueLabel(d, today) : null;
                    return (
                      <tr
                        key={d.id}
                        className="border-t border-border text-foreground transition-colors hover:bg-muted/40"
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
                        <td className="px-4 py-3 max-w-56 truncate">
                          {d.partyName}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONE[d.status]}>
                            {d.status.replace("_", " ")}
                          </Badge>
                        </td>
                        {isFinancial && (
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            {due ? (
                              <span
                                className={cn(
                                  due.tone === "danger" && "text-danger font-medium",
                                  due.tone === "warning" && "text-warning",
                                  due.tone === "neutral" && "text-muted-foreground",
                                )}
                              >
                                {due.text}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right tabular-nums">
                          {inr(d.grandTotal)}
                        </td>
                        {isFinancial && (
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {isDraft || isCancelled || Number(balance) <= 0 ? (
                              <span className="text-muted-foreground">
                                {isDraft || isCancelled ? "—" : "Paid"}
                              </span>
                            ) : (
                              <span className="text-warning">
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
