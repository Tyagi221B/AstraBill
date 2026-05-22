import Link from "next/link";
import type { Metadata } from "next";

import {
  DateRangeFilter,
  currentFyBounds,
} from "@/components/app/DateRangeFilter";
import { Kpi } from "@/components/app/Kpi";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getGstr3bSummary } from "@/lib/services/reports";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "GSTR-3B Summary · AstraBill" };

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function Gstr3bPage({
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

  const summary = await getGstr3bSummary({
    userId: user.id,
    businessId,
    from,
    to,
  });

  return (
    <>
      <PageHeader
        title="GSTR-3B Summary"
        description={
          <Link href={b.reports} className="text-muted-foreground hover:underline">
            ← All reports
          </Link>
        }
      />
      <DateRangeFilter initialFrom={from} initialTo={to} />

      {!summary ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            No data for this period.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Kpi
              label="Outward taxable"
              value={inr(summary.outwardTaxable)}
              hint="Goods + services at any rate > 0"
            />
            <Kpi
              label="Zero-rated (0%)"
              value={inr(summary.outwardZeroRated)}
              hint="Nil-rated outward supplies"
            />
            <Kpi
              label="Exempted"
              value={inr(summary.outwardExempt)}
              hint="GST-exempt supplies"
            />
            <Kpi
              label="Net GST payable"
              value={inr(summary.netGstPayable)}
              tone={Number(summary.netGstPayable) > 0 ? "warning" : "success"}
              hint="Outward tax − Inward (ITC)"
            />
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <h2 className="mb-3 text-base font-semibold">Outward tax</h2>
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">CGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(summary.outwardTax.cgst)}
                  </dd>
                  <dt className="text-muted-foreground">SGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(summary.outwardTax.sgst)}
                  </dd>
                  <dt className="text-muted-foreground">IGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(summary.outwardTax.igst)}
                  </dd>
                  <dt className="border-t border-border pt-2 font-semibold">
                    Total
                  </dt>
                  <dd className="border-t border-border pt-2 text-right font-semibold tabular-nums">
                    {inr(summary.outwardTax.totalTax)}
                  </dd>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h2 className="mb-3 text-base font-semibold">
                  Inward tax (ITC available)
                </h2>
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">CGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(summary.inwardTax.cgst)}
                  </dd>
                  <dt className="text-muted-foreground">SGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(summary.inwardTax.sgst)}
                  </dd>
                  <dt className="text-muted-foreground">IGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(summary.inwardTax.igst)}
                  </dd>
                  <dt className="border-t border-border pt-2 font-semibold">
                    Total
                  </dt>
                  <dd className="border-t border-border pt-2 text-right font-semibold tabular-nums">
                    {inr(summary.inwardTax.totalTax)}
                  </dd>
                </dl>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
