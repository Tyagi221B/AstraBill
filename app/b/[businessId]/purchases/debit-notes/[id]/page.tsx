import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocumentDetailView } from "@/components/documents/DocumentDetailView";
import {
  CancelDocumentButton,
  DeleteDraftButton,
  FinaliseButton,
} from "@/components/documents/DocumentActions";
import { buttonClasses } from "@/components/ui/Button";
import Link from "next/link";
import { findPartyById } from "@/lib/repositories/parties";
import { getDocumentDetail } from "@/lib/services/documents";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Debit note · AstraBill" };

export default async function DebitNoteDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;
  const detail = await getDocumentDetail(id, user.id);
  if (!detail || detail.document.businessId !== businessId) notFound();
  if (detail.document.docType !== "debit_note") notFound();
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
      title="Debit note"
      backLink={{ href: b.debitNotes, label: "All debit notes" }}
      headerActions={
        <>
          {isDraft && (
            <>
              <Link
                href={b.editDebitNote(detail.document.id)}
                className={buttonClasses("outline", "sm")}
              >
                Edit
              </Link>
              <FinaliseButton documentId={detail.document.id} />
              <DeleteDraftButton
                documentId={detail.document.id}
                redirectTo={b.debitNotes}
              />
            </>
          )}
          {!isDraft && !isCancelled && (
            <CancelDocumentButton documentId={detail.document.id} />
          )}
        </>
      }
    />
  );
}
