import type { Metadata } from "next";
import { RotateCcw } from "lucide-react";

import { DocumentListView } from "@/components/documents/DocumentListView";
import { listDocumentsForUser } from "@/lib/services/documents";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Debit notes · AstraBill" };

export default async function DebitNotesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);
  const documents = await listDocumentsForUser({
    userId: user.id,
    businessId,
    docType: "debit_note",
    limit: 500,
  });
  return (
    <DocumentListView
      title="Debit notes"
      pluralNoun="debit notes"
      singularNoun="debit note"
      newCtaHref={b.newDebitNote}
      detailHref={(id) => b.debitNote(id)}
      emptyIcon={RotateCcw}
      emptyDescription="Issue a debit note when goods are returned to a supplier or a purchase correction is needed. Posts a debit to the supplier ledger and removes stock."
      documents={documents}
      isFinancial={true}
    />
  );
}
