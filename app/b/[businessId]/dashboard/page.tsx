/**
 * Dashboard — the home page for a business.
 *
 * Reads the new-domain aggregates: outstanding (sales-invoice receivables),
 * revenue this month (sales-invoice grand_total), paid this month (recorded
 * payment_entries), and low-stock items. The "Recent" list shows the six
 * most recent sales invoices.
 *
 * The business is resolved by the parent layout; this page re-fetches its
 * own copy of the row for the title (a uuid-indexed, deduped SELECT).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AlertCircle,
  CircleCheck,
  PackageOpen,
  TrendingUp,
} from "lucide-react";

import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { Document } from "@/lib/db/schema";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { getBusinessDashboard } from "@/lib/services/dashboard";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

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

/** Indian-grouped rupees, no paise — headline figures read cleaner whole. */
const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Time-of-day greeting in IST (Indian Standard Time, UTC+5:30 — our
 * audience). Pure UTC arithmetic so it works the same in dev, on
 * Vercel, and inside a Docker container without depending on the
 * server's local timezone setting.
 */
function getGreeting(): string {
  const now = new Date();
  const istMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + 330; // +5h30m
  const istHour = Math.floor(istMinutes / 60) % 24;
  if (istHour >= 4 && istHour < 12) return "Good morning";
  if (istHour >= 12 && istHour < 17) return "Good afternoon";
  if (istHour >= 17 && istHour < 21) return "Good evening";
  return "Welcome back";
}

/** Take the first word of a display name; falls back to "there" for the
 *  rare case where neither name nor email yields a usable handle. */
function firstName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0]!;
}

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
        description={`${getGreeting()}, ${firstName(user.name)}`}
        action={
          <Link
            href={b.newSalesInvoice}
            className={buttonClasses("primary", "sm")}
          >
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
          icon={hasOutstanding ? AlertCircle : CircleCheck}
        />
        <Kpi
          label="Paid this month"
          value={inr(data.paidThisMonth)}
          hint="Payments received"
          tone="success"
          icon={CircleCheck}
        />
        <Kpi
          label="Revenue this month"
          value={inr(data.revenueThisMonth)}
          hint="Invoiced this month"
          tone="brand"
          icon={TrendingUp}
        />
      </section>

      {/* ---- recent invoices ---- */}
      <Card className="mb-5">
        <CardContent className="px-0">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 className="text-base font-semibold">Recent invoices</h2>
            <Link
              href={b.salesInvoices}
              className="text-sm text-primary hover:underline"
            >
              View all →
            </Link>
          </div>
          {data.recentSalesInvoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 pb-8 pt-4 text-center">
              <p className="text-sm text-muted-foreground">
                No invoices yet.
              </p>
              <Link
                href={b.newSalesInvoice}
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
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSalesInvoices.map((doc) => (
                  <tr key={doc.id} className="border-t border-border">
                    <td className="px-5 py-3">
                      <Link
                        href={b.salesInvoice(doc.id)}
                        className="font-medium hover:underline"
                      >
                        {doc.docNumber ?? (
                          <span className="italic text-muted-foreground">
                            Draft
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground tabular-nums">
                      {doc.docDate}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[doc.status]}>
                        {doc.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      ₹ {doc.grandTotal}
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
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <PackageOpen className="h-4 w-4 text-warning" />
              Low stock
              <span className="text-sm font-normal text-muted-foreground">
                {data.lowStock.length}{" "}
                {data.lowStock.length === 1 ? "item" : "items"} at or below the
                alert level
              </span>
            </h2>
            <ul className="flex flex-col">
              {data.lowStock.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between border-t border-border py-2.5 text-sm first:border-t-0"
                >
                  <Link
                    href={b.item(item.id)}
                    className="font-medium hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-warning">
                      {item.currentStock}
                    </span>{" "}
                    {item.measuringUnitCode ?? ""} left · alerts at{" "}
                    {item.lowStockThreshold}
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
