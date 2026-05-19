/**
 * Dashboard — the home page for a business.
 *
 * Phase 2D Step 3: the placeholder "Coming soon" cards are replaced with
 * real figures. Three KPIs (outstanding ₹, paid this month, revenue this
 * month), the six most recent invoices, and a low-stock alert list — all
 * from `getBusinessDashboard`. Every money figure was impossible to show
 * truthfully before payment recording landed; it's the keystone this page
 * stands on.
 *
 * The business is resolved by the parent layout; this page re-fetches its
 * own copy of the row for the title (a uuid-indexed, deduped SELECT).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { Invoice } from "@/lib/db/schema";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { getBusinessDashboard } from "@/lib/services/dashboard";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

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

/** Indian-grouped rupees, no paise — headline figures read cleaner whole. */
const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  const b = routes.b(business.id);
  const data = await getBusinessDashboard(businessId, user.id);
  const hasOutstanding = Number(data.outstanding) > 0;

  return (
    <>
      <PageHeader
        title={business.name}
        description="Welcome back"
        action={
          <Link href={b.newInvoice} className={buttonClasses("primary", "sm")}>
            + New invoice
          </Link>
        }
      />

      {/* ---- KPIs ---- */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          label="Outstanding"
          value={inr(data.outstanding)}
          hint={hasOutstanding ? "Yet to be collected" : "All clear"}
          tone={hasOutstanding ? "warning" : "success"}
        />
        <Kpi
          label="Paid this month"
          value={inr(data.paidThisMonth)}
          hint="Payments received"
        />
        <Kpi
          label="Revenue this month"
          value={inr(data.revenueThisMonth)}
          hint="Invoiced this month"
        />
      </section>

      {/* ---- recent invoices ---- */}
      <Card className="mb-5">
        <CardContent className="px-0">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 className="text-base font-semibold">Recent invoices</h2>
            <Link
              href={b.invoices}
              className="text-sm text-primary hover:underline"
            >
              View all →
            </Link>
          </div>
          {data.recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 pb-8 pt-4 text-center">
              <p className="text-sm text-muted-foreground">
                No invoices yet.
              </p>
              <Link
                href={b.newInvoice}
                className={buttonClasses("primary", "sm")}
              >
                Create your first invoice
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Number</th>
                  <th className="px-5 py-2 font-medium">Issued</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recentInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-5 py-3">
                      <Link
                        href={b.invoice(inv.id)}
                        className="font-medium hover:underline"
                      >
                        {inv.number ?? (
                          <span className="italic text-muted-foreground">
                            Draft
                          </span>
                        )}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {TYPE_LABEL[inv.type]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">
                      {inv.issueDate}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[inv.status]}>
                        {inv.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      ₹ {inv.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ---- low stock ---- */}
      {data.lowStock.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">
              Low stock
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {data.lowStock.length}{" "}
                {data.lowStock.length === 1 ? "item" : "items"} at or below the
                alert level
              </span>
            </h2>
            <ul className="flex flex-col">
              {data.lowStock.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between border-t border-border py-2.5 text-sm first:border-t-0"
                >
                  <Link
                    href={b.editProduct(p.id)}
                    className="font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-destructive">
                      {p.stock}
                    </span>{" "}
                    {p.unit} left · alerts at {p.lowStockThreshold}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning" | "success";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1.5 text-2xl font-bold tabular-nums",
            tone === "warning" && "text-destructive",
            tone === "success" && "text-success",
          )}
        >
          {value}
        </div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground/70">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
