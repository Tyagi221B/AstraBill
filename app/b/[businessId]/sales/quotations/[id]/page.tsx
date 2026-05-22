import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocumentDetailView } from "@/components/documents/DocumentDetailView";
import {
  CancelDocumentButton,
  ConvertToInvoiceButton,
  DeleteDraftButton,
  FinaliseButton,
} from "@/components/documents/DocumentActions";
import { buttonClasses } from "@/components/ui/Button";
import Link from "next/link";
import { findPartyById } from "@/lib/repositories/parties";
import { getDocumentDetail } from "@/lib/services/documents";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Quotation · AstraBill" };

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;

  const detail = await getDocumentDetail(id, user.id);
  if (!detail || detail.document.businessId !== businessId) notFound();
  if (detail.document.docType !== "quotation") notFound();
  const b = routes.b(businessId);
  const party = await findPartyById(detail.document.partyId);

  const isDraft = detail.document.status === "draft";
  const isCancelled = detail.document.status === "cancelled";

  return (
    <DocumentDetailView
      document={detail.document}
      lines={detail.lines}
      charges={detail.charges}
      party={party}
      title="Quotation"
      backLink={{ href: b.quotations, label: "All quotations" }}
      headerActions={
        <>
          {isDraft && (
            <>
              <Link
                href={b.editQuotation(detail.document.id)}
                className={buttonClasses("outline", "sm")}
              >
                Edit
              </Link>
              <FinaliseButton documentId={detail.document.id} />
              <DeleteDraftButton
                documentId={detail.document.id}
                redirectTo={b.quotations}
              />
            </>
          )}
          {!isDraft && !isCancelled && (
            <>
              <ConvertToInvoiceButton
                quotationId={detail.document.id}
                detailRouteFor={(newId) => b.editSalesInvoice(newId)}
              />
              <CancelDocumentButton documentId={detail.document.id} />
            </>
          )}
        </>
      }
    />
  );
}
