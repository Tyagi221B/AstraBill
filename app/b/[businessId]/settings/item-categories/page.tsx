import { notFound } from "next/navigation";
import type { Metadata } from "next";

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
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Item categories
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Group items for filtering on the Items page and on reports.
          Categories are workspace-scoped — every item belongs to at most one.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ItemCategoriesPanel businessId={businessId} initial={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
