import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { getParty } from "@/lib/services/parties";
import { requireUser } from "@/lib/session";
import { PartyForm, type PartyFormInitial } from "../../PartyForm";

export const metadata: Metadata = {
  title: "Edit party · AstraBill",
};

export default async function EditPartyPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();
  const party = await getParty(id, user.id);
  if (!party || party.businessId !== business.id) notFound();

  const initial: PartyFormInitial = {
    type: party.type,
    name: party.name,
    mobileNumber: party.mobileNumber ?? "",
    email: party.email ?? "",
    gstin: party.gstin ?? "",
    panNumber: party.panNumber ?? "",
    creditPeriodDays: String(party.creditPeriodDays ?? 30),
    creditLimit: party.creditLimit ?? "0",
    contactPersonName: party.contactPersonName ?? "",
    contactPersonDob: party.contactPersonDob ?? "",
    notes: party.notes ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${party.name}`} />
      <PartyForm
        businessId={business.id}
        editingPartyId={party.id}
        initial={initial}
      />
    </div>
  );
}
