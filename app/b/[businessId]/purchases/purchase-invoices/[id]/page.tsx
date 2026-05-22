import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Decimal from "decimal.js";

import { DocumentDetailView } from "@/components/documents/DocumentDetailView";
import {
  CancelDocumentButton,
  DeleteDraftButton,
  FinaliseButton,
} from "@/components/documents/DocumentActions";
import { PaymentHistorySection } from "@/components/documents/PaymentHistorySection";
import { RecordPaymentModal } from "@/components/documents/RecordPaymentModal";
import { buttonClasses } from "@/components/ui/Button";
import Link from "next/link";
import { findPartyById } from "@/lib/repositories/parties";
import { listPaymentEntriesForDocument } from "@/lib/repositories/payment-entries";
import { getDocumentDetail } from "@/lib/services/documents";
import { listMoneyAccountsForUser } from "@/lib/services/money-accounts";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Purchase invoice · AstraBill" };

export default async function PurchaseInvoiceDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;
  const detail = await getDocumentDetail(id, user.id);
  if (!detail || detail.document.businessId !== businessId) notFound();
  if (detail.document.docType !== "purchase_invoice") notFound();
  const b = routes.b(businessId);
  const party = await findPartyById(detail.document.partyId);

  const isDraft = detail.document.status === "draft";
  const isCancelled = detail.document.status === "cancelled";
  const balance = new Decimal(detail.document.grandTotal)
    .sub(detail.document.amountReceived)
    .toFixed(2);
  const canRecordPayment =
    !isDraft && !isCancelled && new Decimal(balance).gt(0);
  const [paymentHistory, moneyAccounts] = await Promise.all([
    listPaymentEntriesForDocument(detail.document.id),
    listMoneyAccountsForUser({ userId: user.id, businessId }),
  ]);

  return (
    <DocumentDetailView
      document={detail.document}
      lines={detail.lines}
      charges={detail.charges}
      party={party}
      title="Purchase invoice"
      backLink={{ href: b.purchaseInvoices, label: "All purchase invoices" }}
      headerActions={
        <>
          {isDraft && (
            <>
              <Link
                href={b.editPurchaseInvoice(detail.document.id)}
                className={buttonClasses("outline", "sm")}
              >
                Edit
              </Link>
              <FinaliseButton documentId={detail.document.id} />
              <DeleteDraftButton
                documentId={detail.document.id}
                redirectTo={b.purchaseInvoices}
              />
            </>
          )}
          {canRecordPayment && (
            <RecordPaymentModal
              documentId={detail.document.id}
              businessId={businessId}
              partyId={detail.document.partyId}
              outstanding={balance}
              defaultDate={detail.document.docDate}
              moneyAccounts={moneyAccounts}
              entryType="payment_out"
              triggerLabel="Record payment out"
              modalTitle="Record payment to supplier"
            />
          )}
          {!isDraft && !isCancelled && (
            <CancelDocumentButton documentId={detail.document.id} />
          )}
        </>
      }
      paymentHistorySlot={<PaymentHistorySection rows={paymentHistory} />}
    />
  );
}
