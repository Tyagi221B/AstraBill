import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { requireUser } from "@/lib/session";
import { CustomerForm } from "../CustomerForm";

export const metadata: Metadata = {
  title: "New customer · AstraBill",
};

export default async function NewCustomerPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New customer" />
      <CustomerForm
        businesses={[
          {
            id: business.id,
            name: business.name,
            stateCode: business.stateCode,
          },
        ]}
        initialBusinessId={business.id}
      />
    </div>
  );
}
