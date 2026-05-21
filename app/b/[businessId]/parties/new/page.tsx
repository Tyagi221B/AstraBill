import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { requireUser } from "@/lib/session";
import { PartyForm } from "../PartyForm";

export const metadata: Metadata = {
  title: "New party · AstraBill",
};

export default async function NewPartyPage({
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
      <PageHeader title="New party" />
      <PartyForm businessId={business.id} />
    </div>
  );
}
