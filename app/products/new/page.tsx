import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { getMembership, roleHas } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { ProductForm } from "../ProductForm";

export const metadata: Metadata = {
  title: "New product · AstraBill",
};

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const user = await requireUser();
  const { businessId: queryBiz } = await searchParams;

  const memberships = await listBusinessesForUser(user.id);
  if (memberships.length === 0) redirect("/onboarding");

  const initialBusinessId =
    queryBiz && memberships.some((m) => m.business.id === queryBiz)
      ? queryBiz
      : memberships[0]!.business.id;

  // Render the purchase-price field only if the user can actually save it.
  const membership = await getMembership(user.id, initialBusinessId);
  const canSeePurchasePrice =
    membership !== undefined && roleHas(membership.role, "report:view_profit");

  const businessOptions = memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
  }));

  return (
    <AppShell
      crumbs={[
        { label: "Products", href: `/products?businessId=${initialBusinessId}` },
        { label: "New" },
      ]}
    >
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">New product</h1>
        <ProductForm
          businesses={businessOptions}
          initialBusinessId={initialBusinessId}
          canSeePurchasePrice={canSeePurchasePrice}
        />
      </div>
    </AppShell>
  );
}
