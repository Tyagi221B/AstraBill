import Link from "next/link";
import type { Metadata } from "next";

import {
  DateRangeFilter,
  currentFyBounds,
} from "@/components/app/DateRangeFilter";
import { PageHeader } from "@/components/app/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { getGstr1B2b } from "@/lib/services/reports";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "GSTR-1 · AstraBill" };

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function Gstr1Page({
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

  const rows = await getGstr1B2b({
    userId: user.id,
    businessId,
    from,
    to,
  });

  const csvHref = `/api/reports/gstr-1?businessId=${businessId}&from=${from}&to=${to}&format=csv`;

  return (
    <>
      <PageHeader
        title="GSTR-1 · B2B Outward"
        description={
          <Link href={b.reports} className="text-muted-foreground hover:underline">
            ← All reports
          </Link>
        }
        action={
          <a href={csvHref} className={buttonClasses("primary", "sm")} download>
            Download CSV
          </a>
        }
      />
      <DateRangeFilter initialFrom={from} initialTo={to} />

      <Card>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No B2B sales invoices to GST-registered customers in this period.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">GSTIN</th>
                  <th className="px-4 py-2 font-medium">Receiver</th>
                  <th className="px-4 py-2 font-medium">Inv #</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Inv value</th>
                  <th className="px-4 py-2 font-medium">PoS</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                  <th className="px-4 py-2 text-right font-medium">Taxable</th>
                  <th className="px-4 py-2 text-right font-medium">CGST</th>
                  <th className="px-4 py-2 text-right font-medium">SGST</th>
                  <th className="px-4 py-2 text-right font-medium">IGST</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.invoiceNumber}-${i}`} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs">{r.gstin}</td>
                    <td className="px-4 py-3">{r.receiverName}</td>
                    <td className="px-4 py-3 font-medium">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 tabular-nums">{r.invoiceDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {inr(r.invoiceValue)}
                    </td>
                    <td className="px-4 py-3">{r.placeOfSupply}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.rate}%</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {inr(r.taxableValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.cgst)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.sgst)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(r.igst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Validate column names against the GST portal's offline utility before
        uploading; the format is approximated here and validated end-to-end
        against a known-good invoice before launch.
      </p>
    </>
  );
}
