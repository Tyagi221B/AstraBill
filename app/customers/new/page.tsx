import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

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
    <main
      style={{
        maxWidth: 760,
        margin: "3rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Link
        href={`/customers?businessId=${initialBusinessId}`}
        style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none" }}
      >
        ← Customers
      </Link>
      <h1 style={{ fontSize: "1.75rem", margin: "1rem 0 2rem" }}>
        New customer
      </h1>
      <CustomerForm
        businesses={businessOptions}
        initialBusinessId={initialBusinessId}
      />
    </main>
  );
}
