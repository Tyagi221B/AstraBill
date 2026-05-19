import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { getCustomer } from "@/lib/services/customers";
import { requireUser } from "@/lib/session";
import { CustomerForm, type CustomerFormInitial } from "../../CustomerForm";

export const metadata: Metadata = {
  title: "Edit customer · AstraBill",
};

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const customer = await getCustomer(id, user.id);
  if (!customer) notFound();

  const memberships = await listBusinessesForUser(user.id);
  const businessOptions = memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    stateCode: m.business.stateCode,
  }));

  const initial: CustomerFormInitial = {
    name: customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    gstin: customer.gstin ?? "",
    addressLine1: customer.addressLine1 ?? "",
    addressLine2: customer.addressLine2 ?? "",
    city: customer.city ?? "",
    stateCode: customer.stateCode ?? "",
    pincode: customer.pincode ?? "",
    notes: customer.notes ?? "",
  };

  return (
    <AppShell
      crumbs={[
        { label: "Customers", href: `/customers?businessId=${customer.businessId}` },
        { label: customer.name },
      ]}
    >
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">
          Edit {customer.name}
        </h1>
        <CustomerForm
          businesses={businessOptions}
          initialBusinessId={customer.businessId}
          editingCustomerId={customer.id}
          initial={initial}
        />
      </div>
    </AppShell>
  );
}
