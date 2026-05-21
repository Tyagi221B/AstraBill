import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listItemCategoriesForUser } from "@/lib/repositories/item-categories";
import { requireUser } from "@/lib/session";
import { ItemCategoriesPanel } from "./ItemCategoriesPanel";

export const metadata: Metadata = {
  title: "Item categories · AstraBill",
};

export default async function ItemCategoriesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  const categories = await listItemCategoriesForUser({
    userId: user.id,
    businessId,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Item categories"
        description="Group items for filtering on the Items page and on reports. Categories are workspace-scoped — every item belongs to at most one."
      />
      <Card>
        <CardContent className="pt-6">
          <ItemCategoriesPanel
            businessId={businessId}
            initial={categories}
          />
        </CardContent>
      </Card>
    </div>
  );
}
