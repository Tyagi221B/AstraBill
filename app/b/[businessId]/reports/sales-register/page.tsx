import Link from "next/link";
import type { Metadata } from "next";
import Decimal from "decimal.js";

import {
  DateRangeFilter,
  currentFyBounds,
} from "@/components/app/DateRangeFilter";
import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getSalesRegister } from "@/lib/services/reports";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sales Register · AstraBill" };

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function SalesRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const sp = await searchParams;
  const fy = currentFyBounds();
  const from = sp.from ?? fy.from;
  const to = sp.to ?? fy.to;
  const b = routes.b(businessId);

  const rows = await getSalesRegister({
    userId: user.id,
    businessId,
    from,
    to,
  });

  let totalTaxable = new Decimal(0);
  let totalTax = new Decimal(0);
  let totalGrand = new Decimal(0);
  for (const r of rows) {
    if (r.doc.status === "cancelled") continue;
    totalTaxable = totalTaxable.plus(r.doc.taxableAmount);
    totalTax = totalTax.plus(r.doc.totalTaxAmount);
    totalGrand = totalGrand.plus(r.doc.grandTotal);
  }

  return (
    <>
      <PageHeader
        title="Sales Register"
        description={
          <Link href={b.reports} className="text-muted-foreground hover:underline">
            ← All reports
          </Link>
        }
      />
      <DateRangeFilter initialFrom={from} initialTo={to} />

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Total taxable" value={inr(totalTaxable.toFixed(2))} />
        <Kpi label="Total tax" value={inr(totalTax.toFixed(2))} />
        <Kpi label="Total billed" value={inr(totalGrand.toFixed(2))} />
      </section>

      <Card>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No sales invoices in this period.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Number</th>
                  <th className="px-4 py-2 font-medium">Party</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Taxable</th>
                  <th className="px-4 py-2 text-right font-medium">Tax</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.doc.id}
                    className={`border-t border-border ${
                      r.doc.status === "cancelled" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 tabular-nums">{r.doc.docDate}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={b.salesInvoice(r.doc.id)}
                        className="hover:underline"
                      >
                        {r.doc.docNumber ?? "Draft"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{r.partyName ?? "—"}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {r.doc.status.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {inr(r.doc.taxableAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {inr(r.doc.totalTaxAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {inr(r.doc.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
