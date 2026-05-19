import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { getCustomer } from "@/lib/services/customers";
import { requireUser } from "@/lib/session";
import { CustomerForm, type CustomerFormInitial } from "../../CustomerForm";

export const metadata: Metadata = {
  title: "Edit customer · AstraBill",
};

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;

  const customer = await getCustomer(id, user.id);
  if (!customer || customer.businessId !== businessId) notFound();

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

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
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${customer.name}`} />
      <CustomerForm
        businesses={[
          {
            id: business.id,
            name: business.name,
            stateCode: business.stateCode,
          },
        ]}
        initialBusinessId={customer.businessId}
        editingCustomerId={customer.id}
        initial={initial}
      />
    </div>
  );
}
