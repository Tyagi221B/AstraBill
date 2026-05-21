import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listUnitsForUser } from "@/lib/repositories/item-units";
import { listItemCategoriesForUser } from "@/lib/repositories/item-categories";
import { requireUser } from "@/lib/session";
import { ItemForm } from "../ItemForm";

export const metadata: Metadata = {
  title: "New item · AstraBill",
};

export default async function NewItemPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();
  const [units, categories] = await Promise.all([
    listUnitsForUser({ userId: user.id, businessId }),
    listItemCategoriesForUser({ userId: user.id, businessId }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New item" />
      <ItemForm
        businessId={business.id}
        units={units}
        initialCategories={categories}
      />
    </div>
  );
}
