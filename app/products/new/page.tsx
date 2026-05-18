import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

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
    <main
      style={{
        maxWidth: 760,
        margin: "3rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Link
        href={`/products?businessId=${initialBusinessId}`}
        style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none" }}
      >
        ← Products
      </Link>
      <h1 style={{ fontSize: "1.75rem", margin: "1rem 0 2rem" }}>
        New product
      </h1>
      <ProductForm
        businesses={businessOptions}
        initialBusinessId={initialBusinessId}
        canSeePurchasePrice={canSeePurchasePrice}
      />
    </main>
  );
}
