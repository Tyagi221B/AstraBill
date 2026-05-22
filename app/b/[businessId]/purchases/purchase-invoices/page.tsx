import type { Metadata } from "next";
import { FileInput } from "lucide-react";

import { DocumentListView } from "@/components/documents/DocumentListView";
import { listDocumentsForUser } from "@/lib/services/documents";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Purchase invoices · AstraBill" };

export default async function PurchaseInvoicesPage({
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
    docType: "purchase_invoice",
    limit: 500,
  });
  return (
    <DocumentListView
      title="Purchase invoices"
      pluralNoun="purchase invoices"
      singularNoun="purchase invoice"
      newCtaHref={b.newPurchaseInvoice}
      detailHref={(id) => b.purchaseInvoice(id)}
      emptyIcon={FileInput}
      emptyDescription="Record what you bought, who you owe. Capture the supplier's original invoice number for ITC. Posts a credit to the supplier ledger and adds stock IN."
      documents={documents}
      isFinancial={true}
    />
  );
}
