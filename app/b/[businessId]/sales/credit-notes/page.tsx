import type { Metadata } from "next";
import { RotateCcw } from "lucide-react";

import { DocumentListView } from "@/components/documents/DocumentListView";
import { listDocumentsWithPartyForUser } from "@/lib/services/documents";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Credit notes · AstraBill" };

export default async function CreditNotesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);
  const documents = await listDocumentsWithPartyForUser({
    userId: user.id,
    businessId,
    docType: "credit_note",
    limit: 500,
  });
  return (
    <DocumentListView
      title="Credit notes"
      pluralNoun="credit notes"
      singularNoun="credit note"
      newCtaHref={b.newCreditNote}
      detailHref={(id) => b.creditNote(id)}
      emptyIcon={RotateCcw}
      emptyDescription="Issue a credit note when a customer returns goods or a sales correction is needed. Posts a credit to the party ledger and adds stock back in."
      documents={documents}
      isFinancial={true}
    />
  );
}
