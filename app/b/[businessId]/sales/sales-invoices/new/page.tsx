import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocumentForm } from "@/components/documents/DocumentForm";
import { PageHeader } from "@/components/app/PageHeader";
import { applyCityPlaceholder } from "@/lib/constants/doc-type-defaults";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listItemsForUser } from "@/lib/services/items";
import { listPartiesForUser } from "@/lib/services/parties";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "New sales invoice · AstraBill",
};

export default async function NewSalesInvoicePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  const [parties, items] = await Promise.all([
    listPartiesForUser({ userId: user.id, businessId, limit: 500 }),
    listItemsForUser({ userId: user.id, businessId, limit: 500 }),
  ]);

  // Pre-populate T&C from the business's per-doc-type seeded defaults, with
  // [CITY] substituted. Owners can edit per-document.
  const seededTC = business.docTypeDefaults?.sales_invoice?.termsConditions ?? "";
  const defaultTC = applyCityPlaceholder(seededTC, business.city);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="New sales invoice" />
      <DocumentForm
        businessId={business.id}
        businessStateCode={business.stateCode}
        docType="sales_invoice"
        parties={parties}
        items={items}
        defaultTermsConditions={defaultTC}
      />
    </div>
  );
}
