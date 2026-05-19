/**
 * /b/[businessId]/customers/[id] — customer detail + udhaar.
 *
 * The udhaar tracker (V1 feature #3) from the seller's side: who this
 * customer is, what they've been billed, what they've paid, and what they
 * still owe — plus their full invoice history. Real numbers, possible only
 * because payment recording landed (see decision/payment-recording).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { Invoice } from "@/lib/db/schema";
import { getCustomerDetail } from "@/lib/services/customers";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Customer · AstraBill" };

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

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;
  const detail = await getCustomerDetail(id, user.id);
  // 404 for not-found / not-visible, and for a crafted cross-business URL.
  if (!detail || detail.customer.businessId !== businessId) notFound();

  const { customer, invoices, stats } = detail;
  const b = routes.b(businessId);
  const hasOutstanding = Number(stats.outstanding) > 0;

  const addressLines = [
    customer.addressLine1,
    customer.addressLine2,
    [customer.city, customer.state, customer.pincode]
      .filter(Boolean)
      .join(", ") || null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={customer.name}
        description="Customer"
        action={
          <>
            <Link
              href={b.newInvoice}
              className={buttonClasses("primary", "sm")}
            >
              + New invoice
            </Link>
            <Link
              href={b.editCustomer(customer.id)}
              className={buttonClasses("outline", "sm")}
            >
              Edit
            </Link>
          </>
        }
      />

      {/* ---- udhaar stats ---- */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          label="Outstanding"
          value={inr(stats.outstanding)}
          hint={hasOutstanding ? "Yet to be collected" : "All clear"}
          tone={hasOutstanding ? "warning" : "success"}
        />
        <Kpi
          label="Total billed"
          value={inr(stats.billed)}
          hint={`${stats.invoiceCount} ${
            stats.invoiceCount === 1 ? "invoice" : "invoices"
          }`}
        />
        <Kpi label="Total paid" value={inr(stats.paid)} hint="Received" />
      </section>

      {/* ---- contact ---- */}
      <Card className="mb-5">
        <CardContent className="pt-6">
          <h2 className="mb-3 text-base font-semibold">Contact</h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
            <Field label="Phone" value={customer.phone} />
            <Field label="Email" value={customer.email} />
            <Field label="GSTIN" value={customer.gstin} mono />
            <Field
              label="State code"
              value={customer.stateCode}
            />
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                Address
              </dt>
              <dd className="mt-0.5 text-foreground">
                {addressLines.length > 0 ? (
                  <span className="whitespace-pre-line">
                    {addressLines.join("\n")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            {customer.notes && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-foreground/90">
                  {customer.notes}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* ---- invoice history ---- */}
      <Card>
        <CardContent className="px-0">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 className="text-base font-semibold">Invoices</h2>
          </div>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 pb-8 pt-4 text-center">
              <p className="text-sm text-muted-foreground">
                No invoices for this customer yet.
              </p>
              <Link
                href={b.newInvoice}
                className={buttonClasses("primary", "sm")}
              >
                Raise an invoice
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
                  <th className="px-5 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const isDraft = inv.status === "draft";
                  const balance = (
                    Number(inv.total) - Number(inv.amountPaid)
                  ).toFixed(2);
                  return (
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
                      <td className="px-5 py-3 text-right tabular-nums">
                        ₹ {inv.total}
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums">
                        {isDraft || Number(balance) <= 0 ? (
                          <span className="text-muted-foreground">
                            {isDraft ? "—" : "Paid"}
                          </span>
                        ) : (
                          <span className="text-destructive">
                            ₹ {balance}
                          </span>
                        )}
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

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "mt-0.5 font-mono text-foreground" : "mt-0.5 text-foreground"}>
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
