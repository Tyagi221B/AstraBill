import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { DocumentListView } from "@/components/documents/DocumentListView";
import { listDocumentsForUser } from "@/lib/services/documents";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Quotations · AstraBill" };

export default async function QuotationsPage({
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
    docType: "quotation",
    limit: 500,
  });
  return (
    <DocumentListView
      title="Quotations"
      pluralNoun="quotations"
      singularNoun="quotation"
      newCtaHref={b.newQuotation}
      detailHref={(id) => b.quotation(id)}
      emptyIcon={FileText}
      emptyDescription="Send a quotation to a prospect, then convert it to a sales invoice when they accept. Quotations don't post to the books — they're proposals."
      documents={documents}
      isFinancial={false}
    />
  );
}
