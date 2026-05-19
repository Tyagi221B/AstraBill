import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getBusinessForUser } from "@/lib/repositories/businesses";
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
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;

  const product = await getProduct(id, user.id);
  if (!product || product.businessId !== businessId) notFound();

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  const membership = await getMembership(user.id, businessId);
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
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${product.name}`} />
      <ProductForm
        businesses={[{ id: business.id, name: business.name }]}
        initialBusinessId={product.businessId}
        editingProductId={product.id}
        initial={initial}
        canSeePurchasePrice={canSeePurchasePrice}
      />
    </div>
  );
}
