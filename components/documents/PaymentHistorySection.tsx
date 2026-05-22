/**
 * PaymentHistorySection — server component table of all payments that
 * touched one document, rendered as a Card. Used inside DocumentDetailView
 * via its paymentHistorySlot for sales_invoice / purchase_invoice / credit /
 * debit note pages.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PaymentEntry, PaymentEntryAllocation } from "@/lib/db/schema";
import { CancelPaymentButton } from "./CancelPaymentButton";

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function PaymentHistorySection({
  rows,
}: {
  rows: Array<{ entry: PaymentEntry; allocation: PaymentEntryAllocation }>;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="mt-5">
      <CardContent className="px-0">
        <h2 className="px-5 pb-3 pt-5 text-base font-semibold">Payment history</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Mode</th>
              <th className="px-4 py-2 font-medium">Reference</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, allocation }) => (
              <tr key={allocation.id} className="border-t border-border">
                <td className="px-4 py-3 tabular-nums">{entry.entryDate}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {entry.paymentMode.replace("_", " ")}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {entry.reference ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {inr(allocation.allocatedAmount)}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      entry.status === "cancelled" ? "destructive" : "success"
                    }
                  >
                    {entry.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {entry.status === "recorded" && (
                    <CancelPaymentButton paymentEntryId={entry.id} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
