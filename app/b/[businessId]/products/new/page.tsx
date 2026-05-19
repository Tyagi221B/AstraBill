import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { getMembership, roleHas } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { ProductForm } from "../ProductForm";

export const metadata: Metadata = {
  title: "New product · AstraBill",
};

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  // Render the purchase-price field only if the user can actually save it.
  const membership = await getMembership(user.id, businessId);
  const canSeePurchasePrice =
    membership !== undefined && roleHas(membership.role, "report:view_profit");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New product" />
      <ProductForm
        businesses={[{ id: business.id, name: business.name }]}
        initialBusinessId={business.id}
        canSeePurchasePrice={canSeePurchasePrice}
      />
    </div>
  );
}
