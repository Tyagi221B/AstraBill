import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { listBusinessesForUser } from "@/lib/services/businesses";
import { listCustomersForUser } from "@/lib/services/customers";
import { listProductsForUser } from "@/lib/services/products";
import { requireUser } from "@/lib/session";
import { InvoiceForm } from "./InvoiceForm";

export const metadata: Metadata = {
  title: "New invoice · AstraBill",
};

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const user = await requireUser();
  const memberships = await listBusinessesForUser(user.id);

  // No business → can't create an invoice. Send them to onboarding.
  if (memberships.length === 0) redirect("/onboarding");

  const { businessId } = await searchParams;
  const initialBusinessId =
    businessId && memberships.some((m) => m.business.id === businessId)
      ? businessId
      : memberships[0]!.business.id;

  const [customers, products] = await Promise.all([
    listCustomersForUser({ userId: user.id, limit: 500 }),
    listProductsForUser({ userId: user.id, limit: 500 }),
  ]);

  const businessOptions = memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    stateCode: m.business.stateCode,
    gstin: m.business.gstin,
  }));
  const customerOptions = customers.map((c) => ({
    id: c.id,
    businessId: c.businessId,
    name: c.name,
    stateCode: c.stateCode,
    gstin: c.gstin,
    addressLine1: c.addressLine1,
    addressLine2: c.addressLine2,
    city: c.city,
  }));
  const productOptions = products
    .filter((p) => p.isActive)
    .map((p) => ({
      id: p.id,
      businessId: p.businessId,
      name: p.name,
      hsnCode: p.hsnCode,
      unit: p.unit,
      gstRate: p.gstRate,
      sellingPrice: p.sellingPrice,
    }));

  return (
    <main
      style={{
        maxWidth: 1040,
        margin: "3rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
        New invoice
      </h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Add at least one line item. GST is computed automatically from your
        business state and the place of supply.
      </p>
      <InvoiceForm
        businesses={businessOptions}
        customers={customerOptions}
        products={productOptions}
        initialBusinessId={initialBusinessId}
      />
    </main>
  );
}
