import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { listBusinessesForUser } from "@/lib/services/businesses";
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

  const businessOptions = memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    stateCode: m.business.stateCode,
    gstin: m.business.gstin,
  }));

  return (
    <main
      style={{
        maxWidth: 880,
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
        initialBusinessId={initialBusinessId}
      />
    </main>
  );
}
