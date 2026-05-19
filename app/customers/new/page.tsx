import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";
import { CustomerForm } from "../CustomerForm";

export const metadata: Metadata = {
  title: "New customer · AstraBill",
};

export default async function NewCustomerPage({
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

  const businessOptions = memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    stateCode: m.business.stateCode,
  }));

  return (
    <AppShell
      crumbs={[
        { label: "Customers", href: `/customers?businessId=${initialBusinessId}` },
        { label: "New" },
      ]}
    >
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">New customer</h1>
        <CustomerForm
          businesses={businessOptions}
          initialBusinessId={initialBusinessId}
        />
      </div>
    </AppShell>
  );
}
