/**
 * /b/[businessId]/sales/sales-invoices/[id] — sales invoice detail.
 *
 * Read-only render of the finalised document with all lines + charges +
 * ledger context (party balance after finalise). Actions on the right
 * (finalise/cancel/edit/delete) reflect current status.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Decimal from "decimal.js";

import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import type { Document, DocumentLineItem } from "@/lib/db/schema";
import { findPartyById } from "@/lib/repositories/parties";
import { listPaymentEntriesForDocument } from "@/lib/repositories/payment-entries";
import { getDocumentDetail } from "@/lib/services/documents";
import { listMoneyAccountsForUser } from "@/lib/services/money-accounts";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";
import { CancelPaymentButton } from "./CancelPaymentButton";
import { RecordPaymentModal } from "./RecordPaymentModal";
import {
  CancelInvoiceButton,
  DeleteDraftButton,
  FinaliseButton,
} from "./SalesInvoiceActions";

export const metadata: Metadata = { title: "Sales invoice · AstraBill" };

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

export default async function SalesInvoiceDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;

  const detail = await getDocumentDetail(id, user.id);
  if (!detail || detail.document.businessId !== businessId) notFound();
  if (detail.document.docType !== "sales_invoice") notFound();
  const b = routes.b(businessId);
  const { document, lines, charges } = detail;
  const party = await findPartyById(document.partyId);

  const isDraft = document.status === "draft";
  const isCancelled = document.status === "cancelled";
  const balance = new Decimal(document.grandTotal)
    .sub(document.amountReceived)
    .toFixed(2);
  const canRecordPayment =
    !isDraft && !isCancelled && new Decimal(balance).gt(0);
  const [paymentHistory, moneyAccounts] = await Promise.all([
    listPaymentEntriesForDocument(document.id),
    listMoneyAccountsForUser({ userId: user.id, businessId }),
  ]);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
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
            href={b.salesInvoices}
            className="text-muted-foreground hover:underline"
          >
            ← All sales invoices
          </Link>
        }
        action={
          <>
            {isDraft && (
              <>
                <Link
                  href={b.editSalesInvoice(document.id)}
                  className={buttonClasses("outline", "sm")}
                >
                  Edit
                </Link>
                <FinaliseButton documentId={document.id} />
                <DeleteDraftButton
                  documentId={document.id}
                  businessId={businessId}
                />
              </>
            )}
            {canRecordPayment && (
              <RecordPaymentModal
                documentId={document.id}
                businessId={businessId}
                partyId={document.partyId}
                outstanding={balance}
                defaultDate={document.docDate}
                moneyAccounts={moneyAccounts}
              />
            )}
            {!isDraft && !isCancelled && (
              <CancelInvoiceButton documentId={document.id} />
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Bill to</h2>
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
            <h2 className="mb-3 text-base font-semibold">Invoice info</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Date</dt>
              <dd className="tabular-nums">{document.docDate}</dd>
              <dt className="text-muted-foreground">Due</dt>
              <dd className="tabular-nums">{document.dueDate ?? "—"}</dd>
              <dt className="text-muted-foreground">Place of supply</dt>
              <dd>{document.placeOfSupplyStateCode ?? "—"}</dd>
              <dt className="text-muted-foreground">Currency</dt>
              <dd>{document.currencyCode}</dd>
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
                {lines.map((line: DocumentLineItem) => (
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
                      {c.taxable
                        ? `Yes (${c.gstRate ?? "?"}%)`
                        : "No"}
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

      {paymentHistory.length > 0 && (
        <Card className="mt-5">
          <CardContent className="px-0">
            <h2 className="px-5 pb-3 pt-5 text-base font-semibold">
              Payment history
            </h2>
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
                {paymentHistory.map(({ entry, allocation }) => (
                  <tr key={allocation.id} className="border-t border-border">
                    <td className="px-4 py-3 tabular-nums">
                      {entry.entryDate}
                    </td>
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
      )}

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
