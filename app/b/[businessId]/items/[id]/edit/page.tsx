import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listUnitsForUser } from "@/lib/repositories/item-units";
import { listItemCategoriesForUser } from "@/lib/repositories/item-categories";
import { getItem } from "@/lib/services/items";
import { requireUser } from "@/lib/session";
import { ItemForm, type ItemFormInitial } from "../../ItemForm";

export const metadata: Metadata = {
  title: "Edit item · AstraBill",
};

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();
  const item = await getItem(id, user.id);
  if (!item || item.businessId !== business.id) notFound();

  const [units, categories] = await Promise.all([
    listUnitsForUser({ userId: user.id, businessId }),
    listItemCategoriesForUser({ userId: user.id, businessId }),
  ]);

  const initial: ItemFormInitial = {
    type: item.type,
    name: item.name,
    categoryId: item.categoryId ?? "",
    code: item.code ?? "",
    hsnSacCode: item.hsnSacCode ?? "",
    measuringUnitCode: item.measuringUnitCode ?? "PCS",
    alternativeUnitCode: item.alternativeUnitCode ?? "",
    salesPrice: item.salesPrice ?? "",
    salesPriceIncludesTax: item.salesPriceIncludesTax,
    purchasePrice: item.purchasePrice ?? "",
    purchasePriceIncludesTax: item.purchasePriceIncludesTax,
    gstRate: item.gstRate,
    openingStock: item.openingStock ?? "",
    openingStockAsOfDate: item.openingStockAsOfDate ?? "",
    enableLowStockWarning: item.enableLowStockWarning,
    lowStockThreshold: item.lowStockThreshold ?? "",
    description: item.description ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${item.name}`} />
      <ItemForm
        businessId={business.id}
        units={units}
        initialCategories={categories}
        editingItemId={item.id}
        initial={initial}
      />
    </div>
  );
}
