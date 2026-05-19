import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { listInvoicesForUser } from "@/lib/services/invoices";
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
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string; status?: string }>;
}) {
  const user = await requireUser();
  const { businessId, status } = await searchParams;

  const memberships = await listBusinessesForUser(user.id);
  const businessById = new Map(memberships.map((m) => [m.business.id, m.business]));

  const activeStatus =
    status &&
    STATUSES.some((s) => s.value === status && s.value !== "all")
      ? (status as Invoice["status"])
      : undefined;

  const invoices = await listInvoicesForUser({
    userId: user.id,
    businessId,
    status: activeStatus,
    limit: 100,
  });

  const queryWithout = (drop: "status" | "businessId") => {
    const params = new URLSearchParams();
    if (drop !== "businessId" && businessId) params.set("businessId", businessId);
    if (drop !== "status" && status) params.set("status", status);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };
  const withParam = (key: "status" | "businessId", value: string) => {
    const params = new URLSearchParams();
    if (key !== "businessId" && businessId) params.set("businessId", businessId);
    if (key !== "status" && status) params.set("status", status);
    if (value !== "all") params.set(key, value);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const filterBusiness = businessId ? businessById.get(businessId) : null;
  const newHref = filterBusiness
    ? `/invoices/new?businessId=${filterBusiness.id}`
    : "/invoices/new";

  return (
    <AppShell crumbs={[{ label: "Invoices" }]}>
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {filterBusiness ? `${filterBusiness.name} — Invoices` : "Invoices"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
            {activeStatus ? ` · ${activeStatus.replace("_", " ")}` : ""}
          </p>
        </div>
        <Link href={newHref} className={buttonClasses("primary", "sm")}>
          + New invoice
        </Link>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted-foreground">Status</span>
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={`/invoices${withParam("status", s.value)}`}
            className={filterPill(
              s.value === "all" ? !status : status === s.value,
            )}
          >
            {s.label}
          </Link>
        ))}
        {memberships.length > 1 && (
          <>
            <span className="ml-3 mr-1 text-xs text-muted-foreground">
              Business
            </span>
            <Link
              href={`/invoices${queryWithout("businessId")}`}
              className={filterPill(!businessId)}
            >
              All
            </Link>
            {memberships.map((m) => (
              <Link
                key={m.business.id}
                href={`/invoices${withParam("businessId", m.business.id)}`}
                className={filterPill(businessId === m.business.id)}
              >
                {m.business.name}
              </Link>
            ))}
          </>
        )}
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No invoices{activeStatus ? ` with status ${activeStatus}` : ""} yet.
            </p>
            <Link href={newHref} className={buttonClasses("primary", "sm")}>
              Create your first invoice
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Number</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Business</th>
                    <th className="px-4 py-3 font-medium">Issued</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const biz = businessById.get(inv.businessId);
                    return (
                      <tr
                        key={inv.id}
                        className="border-t border-border text-foreground"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/invoices/${inv.id}`}
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
                        <td className="px-4 py-3 text-muted-foreground">
                          {biz?.name ?? "—"}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
