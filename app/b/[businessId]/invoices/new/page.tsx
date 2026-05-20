import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listCustomersForUser } from "@/lib/services/customers";
import { listProductsForUser } from "@/lib/services/products";
import { requireUser } from "@/lib/session";
import { InvoiceForm } from "./InvoiceForm";

export const metadata: Metadata = {
  title: "New invoice · AstraBill",
};

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  // The layout already verified membership; re-fetch the row for its
  // GST fields (stateCode / gstin) the form needs.
  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  // Customers + products are scoped to this business — the pickers only ever
  // offer items that belong here.
  const [customers, products] = await Promise.all([
    listCustomersForUser({ userId: user.id, businessId, limit: 500 }),
    listProductsForUser({ userId: user.id, businessId, limit: 500 }),
  ]);

  const businessOptions = [
    {
      id: business.id,
      name: business.name,
      stateCode: business.stateCode,
      gstin: business.gstin,
    },
  ];
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
    <InvoiceForm
      businesses={businessOptions}
      customers={customerOptions}
      products={productOptions}
      initialBusinessId={business.id}
    />
  );
}
