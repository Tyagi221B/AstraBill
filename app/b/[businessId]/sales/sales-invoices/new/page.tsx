import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DocumentForm } from "@/components/documents/DocumentForm";
import { applyCityPlaceholder } from "@/lib/constants/doc-type-defaults";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listItemCategoriesForUser } from "@/lib/repositories/item-categories";
import { listItemsForUser } from "@/lib/services/items";
import { listMoneyAccountsForUser } from "@/lib/services/money-accounts";
import { listPartiesWithBalanceForUser } from "@/lib/services/parties";
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

  const [parties, items, itemCategories, moneyAccounts] = await Promise.all([
    listPartiesWithBalanceForUser({ userId: user.id, businessId, limit: 500 }),
    listItemsForUser({ userId: user.id, businessId, limit: 500 }),
    listItemCategoriesForUser({ userId: user.id, businessId }),
    listMoneyAccountsForUser({ userId: user.id, businessId }),
  ]);

  const seededTC = business.docTypeDefaults?.sales_invoice?.termsConditions ?? "";
  const defaultTC = applyCityPlaceholder(seededTC, business.city);

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
        defaultTermsConditions={defaultTC}
      />
    </div>
  );
}
