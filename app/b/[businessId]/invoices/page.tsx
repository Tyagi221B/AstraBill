/**
 * /b/[businessId]/invoices — invoice list for one business.
 *
 * Business-scoped: `businessId` comes from the path, membership is already
 * verified by the parent layout. The status filter stays in the query
 * string (`?status=`). The old cross-business "Business" column and the
 * business filter pills are gone — this page is one business by definition.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { listInvoicesForUser } from "@/lib/services/invoices";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Invoices · AstraBill",
};

const TYPE_LABEL: Record<Invoice["type"], string> = {
  tax_invoice: "Tax Invoice",
  estimate: "Estimate",
  cash_receipt: "Cash Receipt",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  delivery_challan: "Delivery Challan",
};

const STATUS_TONE: Record<
  Invoice["status"],
  "neutral" | "info" | "success" | "warning" | "destructive"
> = {
  draft: "neutral",
  sent: "info",
  seen: "info",
  partially_paid: "warning",
  paid: "success",
  overdue: "destructive",
};

const STATUSES: { value: Invoice["status"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

function filterPill(active: boolean) {
  return cn(
    "rounded-md px-3 py-1.5 text-sm transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export default async function InvoicesListPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const { status } = await searchParams;
  const b = routes.b(businessId);

  const activeStatus =
    status && STATUSES.some((s) => s.value === status && s.value !== "all")
      ? (status as Invoice["status"])
      : undefined;

  const invoices = await listInvoicesForUser({
    userId: user.id,
    businessId,
    status: activeStatus,
    limit: 100,
  });

  const statusHref = (value: Invoice["status"] | "all") =>
    value === "all" ? b.invoices : `${b.invoices}?status=${value}`;

  return (
    <>
      <PageHeader
        title="Invoices"
        description={`${invoices.length} ${
          invoices.length === 1 ? "invoice" : "invoices"
        }${activeStatus ? ` · ${activeStatus.replace("_", " ")}` : ""}`}
        action={
          <Link href={b.newInvoice} className={buttonClasses("primary", "sm")}>
            + New invoice
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted-foreground">Status</span>
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={statusHref(s.value)}
            className={filterPill(
              s.value === "all" ? !status : status === s.value,
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={
            activeStatus
              ? `No ${activeStatus.replace("_", " ")} invoices`
              : "No invoices yet"
          }
          description={
            activeStatus
              ? "Switch the status filter above to see other invoices."
              : "Your first invoice is a draft until you finalise. GST is computed automatically from the place of supply."
          }
          action={
            <Link
              href={b.newInvoice}
              className={buttonClasses("primary", "sm")}
            >
              + Create your first invoice
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
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Issued</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-t border-border text-foreground"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={b.invoice(inv.id)}
                          className="font-medium hover:underline"
                        >
                          {inv.number ?? (
                            <span
                              className="italic text-muted-foreground"
                              title="Drafts are unnumbered. The number is assigned when you finalise."
                            >
                              Draft — number assigned on finalise
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {TYPE_LABEL[inv.type]}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {inv.issueDate}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[inv.status]}>
                          {inv.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        ₹ {inv.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
