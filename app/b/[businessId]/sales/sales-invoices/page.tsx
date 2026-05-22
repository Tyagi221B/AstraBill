/**
 * /b/[businessId]/sales/sales-invoices — list page.
 *
 * Lists all sales_invoice documents for the business. KPIs: count split by
 * status (Draft / Unpaid / Paid / Cancelled) + total billed (non-cancelled
 * non-draft).
 */
import Link from "next/link";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import Decimal from "decimal.js";

import { EmptyState } from "@/components/app/EmptyState";
import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { Document } from "@/lib/db/schema";
import { listDocumentsForUser } from "@/lib/services/documents";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sales invoices · AstraBill",
};

const STATUS_TONE: Record<
  Document["status"],
  "neutral" | "info" | "success" | "warning" | "destructive"
> = {
  draft: "neutral",
  unpaid: "info",
  partial_paid: "warning",
  paid: "success",
  cancelled: "destructive",
};

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function SalesInvoicesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const documents = await listDocumentsForUser({
    userId: user.id,
    businessId,
    docType: "sales_invoice",
    limit: 500,
  });

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
        title="Sales invoices"
        description={`${documents.length} ${
          documents.length === 1 ? "invoice" : "invoices"
        }`}
        action={
          <Link
            href={b.newSalesInvoice}
            className={buttonClasses("primary", "sm")}
          >
            + New sales invoice
          </Link>
        }
      />

      {documents.length > 0 && (
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Kpi label="Total billed" value={inr(totalBilled.toFixed(2))} />
          <Kpi
            label="Unpaid"
            value={inr(unpaidValue.toFixed(2))}
            tone={unpaidValue.gt(0) ? "warning" : "neutral"}
          />
          <Kpi label="Drafts" value={String(counts.draft)} />
          <Kpi label="Cancelled" value={String(counts.cancelled)} />
        </section>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No sales invoices yet"
          description="Issue a sales invoice to record what a customer owes you. Drafts can be edited; once finalised, the books update."
          action={
            <Link
              href={b.newSalesInvoice}
              className={buttonClasses("primary", "sm")}
            >
              + New sales invoice
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
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
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
                            href={b.salesInvoice(d.id)}
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
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={b.salesInvoice(d.id)}
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
