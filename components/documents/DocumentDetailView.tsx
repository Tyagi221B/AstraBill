/**
 * DocumentDetailView — server component that renders any finalised /
 * draft / cancelled document. Used by per-doc-type detail page routes
 * which only differ in the action buttons rendered in the header.
 *
 * Note: this is a server component (no "use client"), so it can pull data
 * from server-only repositories directly. Interactive bits (Finalise,
 * Cancel, Payment, Convert) are passed in as the `headerActions` slot.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import Decimal from "decimal.js";

import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type {
  Document,
  DocumentAdditionalCharge,
  DocumentLineItem,
  Party,
} from "@/lib/db/schema";

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

const inr = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function DocumentDetailView({
  document,
  lines,
  charges,
  party,
  title,
  backLink,
  headerActions,
  paymentHistorySlot,
}: {
  document: Document;
  lines: DocumentLineItem[];
  charges: DocumentAdditionalCharge[];
  party: Party | null;
  /** Human title for the doc type. e.g. "Quotation", "Purchase invoice". */
  title: string;
  /** "← All quotations" target. */
  backLink: { href: string; label: string };
  /** Right-side action buttons (status-aware, picked per doc type). */
  headerActions: ReactNode;
  /** Optional Payment History section (rendered for sales_invoice / purchase_invoice). */
  paymentHistorySlot?: ReactNode;
}) {
  const isDraft = document.status === "draft";
  const isCancelled = document.status === "cancelled";
  const balance = new Decimal(document.grandTotal)
    .sub(document.amountReceived)
    .toFixed(2);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span>{title}</span>
            <span>
              {document.docNumber ?? (
                <span className="italic text-muted-foreground">Draft</span>
              )}
            </span>
            <Badge tone={STATUS_TONE[document.status]}>
              {document.status.replace("_", " ")}
            </Badge>
          </span>
        }
        description={
          <Link
            href={backLink.href}
            className="text-muted-foreground hover:underline"
          >
            ← {backLink.label}
          </Link>
        }
        action={headerActions}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Party</h2>
            <div className="text-sm">
              <p className="font-semibold text-foreground">
                {party?.name ?? "—"}
              </p>
              {party?.gstin && (
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  GSTIN: {party.gstin}
                </p>
              )}
              {party?.mobileNumber && (
                <p className="mt-0.5 text-muted-foreground">
                  {party.mobileNumber}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Document</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Date</dt>
              <dd className="tabular-nums">{document.docDate}</dd>
              <dt className="text-muted-foreground">Due / valid</dt>
              <dd className="tabular-nums">{document.dueDate ?? "—"}</dd>
              <dt className="text-muted-foreground">Place of supply</dt>
              <dd>{document.placeOfSupplyStateCode ?? "—"}</dd>
              {document.originalDocNumber && (
                <>
                  <dt className="text-muted-foreground">Original #</dt>
                  <dd className="font-mono text-xs">
                    {document.originalDocNumber}
                  </dd>
                </>
              )}
              {document.originalDocDate && (
                <>
                  <dt className="text-muted-foreground">Original date</dt>
                  <dd className="tabular-nums">{document.originalDocDate}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Status</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Grand total</dt>
              <dd className="text-right font-semibold tabular-nums">
                {inr(document.grandTotal)}
              </dd>
              <dt className="text-muted-foreground">Received</dt>
              <dd className="text-right tabular-nums">
                {inr(document.amountReceived)}
              </dd>
              <dt className="text-muted-foreground">Outstanding</dt>
              <dd
                className={`text-right font-semibold tabular-nums ${
                  isDraft || isCancelled
                    ? "text-muted-foreground"
                    : new Decimal(balance).gt(0)
                      ? "text-red-700 dark:text-red-400"
                      : "text-green-700 dark:text-green-400"
                }`}
              >
                {isDraft || isCancelled ? "—" : inr(balance)}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardContent className="px-0">
          <h2 className="px-5 pb-3 pt-5 text-base font-semibold">Line items</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">HSN</th>
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                  <th className="px-4 py-2 text-right font-medium">Disc</th>
                  <th className="px-4 py-2 font-medium">Tax</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-t border-border">
                    <td className="px-4 py-3 text-muted-foreground">
                      {line.lineNo}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {line.itemNameSnapshot}
                      {line.description && (
                        <p className="text-xs text-muted-foreground">
                          {line.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {line.hsnSacCodeSnapshot ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {line.quantity}{" "}
                      {line.unitCodeSnapshot && (
                        <span className="text-xs text-muted-foreground">
                          {line.unitCodeSnapshot}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ₹ {line.pricePerUnit}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {Number(line.discountAmount) > 0
                        ? `− ₹ ${line.discountAmount}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {line.gstRate === null
                        ? "Exempt"
                        : Number(line.gstRate) === 0
                          ? "0%"
                          : `${Number(line.gstRate)}%`}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      ₹ {line.lineAmount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {charges.length > 0 && (
        <Card className="mt-5">
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Additional charges</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Label</th>
                  <th className="px-2 py-2 font-medium">Taxable</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-2 py-2">{c.label}</td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {c.taxable ? `Yes (${c.gstRate ?? "?"}%)` : "No"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      ₹ {c.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {paymentHistorySlot}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Notes &amp; terms</h2>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-foreground/90">
                  {document.notes || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Terms &amp; conditions
                </p>
                <p className="mt-1 whitespace-pre-wrap text-foreground/90">
                  {document.termsConditions || "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Totals</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right tabular-nums">
                {inr(document.subtotal)}
              </dd>
              <dt className="text-muted-foreground">Line discount</dt>
              <dd className="text-right tabular-nums">
                − {inr(document.totalLineDiscount)}
              </dd>
              <dt className="text-muted-foreground">Taxable</dt>
              <dd className="text-right tabular-nums">
                {inr(document.taxableAmount)}
              </dd>
              {Number(document.igstAmount) > 0 ? (
                <>
                  <dt className="text-muted-foreground">IGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(document.igstAmount)}
                  </dd>
                </>
              ) : (
                <>
                  <dt className="text-muted-foreground">CGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(document.cgstAmount)}
                  </dd>
                  <dt className="text-muted-foreground">SGST</dt>
                  <dd className="text-right tabular-nums">
                    {inr(document.sgstAmount)}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Round off</dt>
              <dd className="text-right tabular-nums">
                {inr(document.roundOff)}
              </dd>
              <dt className="border-t border-border pt-2 text-base font-semibold">
                Grand total
              </dt>
              <dd className="border-t border-border pt-2 text-right text-base font-semibold tabular-nums">
                {inr(document.grandTotal)}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
