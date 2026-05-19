import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { getInvoice } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";
import { InvoiceActions } from "./InvoiceActions";

export const metadata: Metadata = {
  title: "Invoice · AstraBill",
};

const TYPE_LABEL: Record<string, string> = {
  tax_invoice: "Tax Invoice",
  estimate: "Estimate",
  cash_receipt: "Cash Receipt",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  delivery_challan: "Delivery Challan",
};

const STATUS_TONE: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "destructive"
> = {
  draft: "neutral",
  sent: "info",
  seen: "info",
  partially_paid: "warning",
  paid: "success",
  overdue: "destructive",
};

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;
  const invoice = await getInvoice(id, user.id);
  // 404 for not-found / not-visible — and also when the invoice belongs to a
  // different business than the URL claims (a crafted /b/X/invoices/Y where
  // Y is in business Z). The membership of X is already verified by the
  // layout; this guard keeps the URL honest.
  if (!invoice || invoice.businessId !== businessId) notFound();

  const taxClass =
    Number(invoice.igstAmount) > 0 ? "interstate" : "intrastate";

  return (
    <>
      <PageHeader
        title={
          invoice.number ?? (
            <span className="text-muted-foreground">
              Draft
              <span className="ml-2 text-sm font-normal text-muted-foreground/70">
                — number assigned on finalise
              </span>
            </span>
          )
        }
        description={`${TYPE_LABEL[invoice.type] ?? invoice.type} · Issued ${
          invoice.issueDate
        }${invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}`}
        action={
          <>
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("outline", "sm")}
            >
              Download PDF
            </a>
            <InvoiceActions
              businessId={businessId}
              invoiceId={invoice.id}
              status={invoice.status}
            />
            <Badge tone={STATUS_TONE[invoice.status] ?? "neutral"}>
              {invoice.status.replace("_", " ")}
            </Badge>
          </>
        }
      />

      <Card className="mb-5">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Line items</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium" style={{ width: "40%" }}>
                    Description
                  </th>
                  <th className="px-2 py-2 font-medium">HSN</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Unit</th>
                  <th className="px-2 py-2 text-right font-medium">Price</th>
                  <th className="px-2 py-2 text-right font-medium">GST</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="px-2 py-2.5">{line.description}</td>
                      <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">
                        {line.hsnCode ?? "—"}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {line.quantity}
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">
                        {line.unit}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        ₹ {line.unitPrice}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {line.gstRate}%
                      </td>
                      <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                        ₹ {line.amount}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="ml-auto mb-5 max-w-sm">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-base font-semibold">Totals</h2>
          <dl className="flex flex-col gap-1.5 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>₹ {invoice.subtotal}</dd>
            </div>
            {Number(invoice.discountAmount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd>− ₹ {invoice.discountAmount}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Taxable</dt>
              <dd>₹ {invoice.taxableAmount}</dd>
            </div>
            {taxClass === "intrastate" ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">CGST</dt>
                  <dd>₹ {invoice.cgstAmount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">SGST</dt>
                  <dd>₹ {invoice.sgstAmount}</dd>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">IGST</dt>
                <dd>₹ {invoice.igstAmount}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Round-off</dt>
              <dd>
                {invoice.roundOff.startsWith("-") ? "−" : "+"} ₹{" "}
                {invoice.roundOff.replace(/^-/, "")}
              </dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2.5 text-base font-bold">
              <dt>Total</dt>
              <dd>₹ {invoice.total}</dd>
            </div>
          </dl>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {taxClass === "intrastate"
              ? "Intrastate — CGST + SGST"
              : "Interstate — IGST"}
          </p>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-2 text-base font-semibold">Notes</h2>
            <p className="whitespace-pre-wrap text-sm text-foreground/90">
              {invoice.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
