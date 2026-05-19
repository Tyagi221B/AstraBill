import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { getProduct } from "@/lib/services/products";
import { getMembership, roleHas } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { ProductForm, type ProductFormInitial } from "../../ProductForm";

export const metadata: Metadata = {
  title: "Edit product · AstraBill",
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const product = await getProduct(id, user.id);
  if (!product) notFound();

  const memberships = await listBusinessesForUser(user.id);
  const businessOptions = memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
  }));

  const membership = await getMembership(user.id, product.businessId);
  const canSeePurchasePrice =
    membership !== undefined && roleHas(membership.role, "report:view_profit");

  const initial: ProductFormInitial = {
    name: product.name,
    hsnCode: product.hsnCode ?? "",
    unit: product.unit,
    gstRate: product.gstRate,
    // purchasePrice may be undefined (redacted) — render empty in that case.
    purchasePrice: product.purchasePrice ?? "",
    sellingPrice: product.sellingPrice,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold ?? "",
    isActive: product.isActive,
  };

  return (
    <AppShell
      crumbs={[
        { label: "Products", href: `/products?businessId=${product.businessId}` },
        { label: product.name },
      ]}
    >
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">
          Edit {product.name}
        </h1>
        <ProductForm
          businesses={businessOptions}
          initialBusinessId={product.businessId}
          editingProductId={product.id}
          initial={initial}
          canSeePurchasePrice={canSeePurchasePrice}
        />
      </div>
    </AppShell>
  );
}
