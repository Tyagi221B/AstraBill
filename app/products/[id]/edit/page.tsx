import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

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
    <main
      style={{
        maxWidth: 760,
        margin: "3rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Link
        href={`/products?businessId=${product.businessId}`}
        style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none" }}
      >
        ← Products
      </Link>
      <h1 style={{ fontSize: "1.75rem", margin: "1rem 0 2rem" }}>
        Edit {product.name}
      </h1>
      <ProductForm
        businesses={businessOptions}
        initialBusinessId={product.businessId}
        editingProductId={product.id}
        initial={initial}
        canSeePurchasePrice={canSeePurchasePrice}
      />
    </main>
  );
}
