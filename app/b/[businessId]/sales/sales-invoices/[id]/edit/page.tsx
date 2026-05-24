import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocumentForm } from "@/components/documents/DocumentForm";
import type {
  DocumentFormInitial,
  LineDraft,
} from "@/components/documents/DocumentForm";
import { ConflictError } from "@/lib/errors";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listItemCategoriesForUser } from "@/lib/repositories/item-categories";
import { listItemsForUser } from "@/lib/services/items";
import { listMoneyAccountsForUser } from "@/lib/services/money-accounts";
import { listPartiesWithBalanceForUser } from "@/lib/services/parties";
import { getDocumentDetail } from "@/lib/services/documents";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Edit sales invoice · AstraBill",
};

export default async function EditSalesInvoicePage({
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
  if (detail.document.docType !== "sales_invoice") notFound();
  if (detail.document.status !== "draft") {
    // The form only edits drafts; redirect to the detail page via 404 here
    // for consistency. (Conflict thrown server-side on the API too.)
    throw new ConflictError("This invoice is finalised — cancel before edit.");
  }

  const [parties, items, itemCategories, moneyAccounts] = await Promise.all([
    listPartiesWithBalanceForUser({ userId: user.id, businessId, limit: 500 }),
    listItemsForUser({ userId: user.id, businessId, limit: 500 }),
    listItemCategoriesForUser({ userId: user.id, businessId }),
    listMoneyAccountsForUser({ userId: user.id, businessId }),
  ]);

  const lines: LineDraft[] = detail.lines.map((line) => ({
    itemId: line.itemId ?? "",
    itemName: line.itemNameSnapshot,
    hsn: line.hsnSacCodeSnapshot ?? "",
    unit: line.unitCodeSnapshot ?? "PCS",
    qty: line.quantity,
    price: line.pricePerUnit,
    gstRate: line.gstRate ?? "",
    discountPercent: line.discountPercent ?? "",
  }));

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
    lines: lines.length ? lines : [],
    shipToAddressId: detail.document.shipToAddressId ?? null,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <DocumentForm
        businessId={business.id}
        businessStateCode={business.stateCode}
        business={business}
        docType="sales_invoice"
        parties={parties}
        items={items}
        itemCategories={itemCategories}
        moneyAccounts={moneyAccounts}
        editingId={id}
        initial={initial}
        defaultTermsConditions=""
      />
    </div>
  );
}
