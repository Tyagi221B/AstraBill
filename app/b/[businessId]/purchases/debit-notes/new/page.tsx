import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocumentForm } from "@/components/documents/DocumentForm";
import { PageHeader } from "@/components/app/PageHeader";
import { applyCityPlaceholder } from "@/lib/constants/doc-type-defaults";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listItemsForUser } from "@/lib/services/items";
import { listPartiesForUser } from "@/lib/services/parties";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "New debit note · AstraBill" };

export default async function NewDebitNotePage({
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
  const seededTC =
    business.docTypeDefaults?.debit_note?.termsConditions ?? "";
  const defaultTC = applyCityPlaceholder(seededTC, business.city);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="New debit note" />
      <DocumentForm
        businessId={business.id}
        businessStateCode={business.stateCode}
        docType="debit_note"
        parties={parties}
        items={items}
        defaultTermsConditions={defaultTC}
      />
    </div>
  );
}
