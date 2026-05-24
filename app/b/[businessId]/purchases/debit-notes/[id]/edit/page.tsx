import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocumentForm, type DocumentFormInitial } from "@/components/documents/DocumentForm";
import { PageHeader } from "@/components/app/PageHeader";
import { ConflictError } from "@/lib/errors";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listItemsForUser } from "@/lib/services/items";
import { listPartiesForUser } from "@/lib/services/parties";
import { getDocumentDetail } from "@/lib/services/documents";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Edit debit note · AstraBill" };

export default async function EditDebitNotePage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;
  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();
  const detail = await getDocumentDetail(id, user.id);
  if (!detail || detail.document.businessId !== businessId) notFound();
  if (detail.document.docType !== "debit_note") notFound();
  if (detail.document.status !== "draft") {
    throw new ConflictError("This debit note is finalised.");
  }
  const [parties, items] = await Promise.all([
    listPartiesForUser({ userId: user.id, businessId, limit: 500 }),
    listItemsForUser({ userId: user.id, businessId, limit: 500 }),
  ]);
  const initial: DocumentFormInitial = {
    partyId: detail.document.partyId,
    docDate: detail.document.docDate,
    paymentTermsDays: String(detail.document.paymentTermsDays ?? 30),
    dueDate: detail.document.dueDate ?? "",
    placeOfSupplyStateCode: detail.document.placeOfSupplyStateCode ?? "",
    originalDocNumber: detail.document.originalDocNumber ?? "",
    originalDocDate: detail.document.originalDocDate ?? "",
    notes: detail.document.notes ?? "",
    termsConditions: detail.document.termsConditions ?? "",
    lines: detail.lines.map((line) => ({
      itemId: line.itemId ?? "",
      itemName: line.itemNameSnapshot,
      hsn: line.hsnSacCodeSnapshot ?? "",
      unit: line.unitCodeSnapshot ?? "PCS",
      qty: line.quantity,
      price: line.pricePerUnit,
      gstRate: line.gstRate ?? "",
      discountPercent: line.discountPercent ?? "",
    })),
    shipToAddressId: detail.document.shipToAddressId ?? null,
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Edit · draft debit note" />
      <DocumentForm
        businessId={business.id}
        businessStateCode={business.stateCode}
        docType="debit_note"
        parties={parties}
        items={items}
        editingId={id}
        initial={initial}
        defaultTermsConditions=""
      />
    </div>
  );
}
