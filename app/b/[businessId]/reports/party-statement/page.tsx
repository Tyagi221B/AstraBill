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
import { listPartiesForUser } from "@/lib/services/parties";
import { getPartyStatement } from "@/lib/services/reports";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";
import { PartyPicker } from "./PartyPicker";

export const metadata: Metadata = { title: "Party Statement · AstraBill" };

const VOUCHER_LABEL = {
  opening_balance: "Opening balance",
  sales_invoice: "Sales invoice",
  purchase_invoice: "Purchase invoice",
  credit_note: "Credit note",
  debit_note: "Debit note",
  payment_in: "Payment in",
  payment_out: "Payment out",
  settlement_discount: "Settlement discount",
  manual_adjustment: "Manual adjustment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  bank_charges: "Bank charges",
  reversal: "Reversal",
} as const;

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function PartyStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    partyId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const sp = await searchParams;
  const fy = currentFyBounds();
  const from = sp.from ?? fy.from;
  const to = sp.to ?? fy.to;
  const b = routes.b(businessId);

  const allParties = await listPartiesForUser({
    userId: user.id,
    businessId,
    limit: 1000,
  });

  const statement = sp.partyId
    ? await getPartyStatement({
        userId: user.id,
        businessId,
        partyId: sp.partyId,
        from,
        to,
      })
    : null;

  return (
    <>
      <PageHeader
        title="Party Statement"
        description={
          <Link href={b.reports} className="text-muted-foreground hover:underline">
            ← All reports
          </Link>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <PartyPicker
          parties={allParties}
          selectedId={sp.partyId ?? ""}
        />
      </div>
      <DateRangeFilter initialFrom={from} initialTo={to} />

      {!statement ? (
        <Card>
          <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
            Pick a party above to see their ledger statement.
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi
              label="Opening balance"
              value={inr(statement.openingBalance)}
              hint={new Decimal(statement.openingBalance).gte(0) ? "Receivable" : "Payable"}
            />
            <Kpi
              label="Closing balance"
              value={inr(statement.closingBalance)}
              hint={new Decimal(statement.closingBalance).gte(0) ? "Receivable" : "Payable"}
              tone={
                new Decimal(statement.closingBalance).abs().gt(0)
                  ? "warning"
                  : "success"
              }
            />
            <Kpi
              label="Entries"
              value={String(statement.entries.length)}
            />
          </section>

          <Card>
            <CardContent className="px-0">
              {statement.entries.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No ledger entries in this period.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Voucher</th>
                      <th className="px-4 py-2 text-right font-medium">Debit</th>
                      <th className="px-4 py-2 text-right font-medium">Credit</th>
                      <th className="px-4 py-2 font-medium">Narration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.entries.map((e) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {e.entryDate ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {VOUCHER_LABEL[e.voucherType] ?? e.voucherType}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">
                          {e.debitAmount ? inr(e.debitAmount) : ""}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-700 dark:text-red-400">
                          {e.creditAmount ? inr(e.creditAmount) : ""}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {e.narration ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
