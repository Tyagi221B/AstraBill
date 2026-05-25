import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listPartyCategoriesForUser } from "@/lib/repositories/party-categories";
import { requireUser } from "@/lib/session";
import { PartyCategoriesPanel } from "./PartyCategoriesPanel";

export const metadata: Metadata = {
  title: "Party categories · AstraBill",
};

export default async function PartyCategoriesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  const categories = await listPartyCategoriesForUser({
    userId: user.id,
    businessId,
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Party categories
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Group customers and suppliers (VIP / Wholesale / Retail …) so you can
          filter the Parties list. Optional — every party belongs to at most
          one category.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <PartyCategoriesPanel businessId={businessId} initial={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
