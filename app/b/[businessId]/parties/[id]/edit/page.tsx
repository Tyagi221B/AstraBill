import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import {
  getOpeningBalanceEntryForParty,
  hasNonOpeningActivityForParty,
} from "@/lib/repositories/ledger-entries";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import {
  getBillingAddressForParty,
  getDefaultShippingAddressForParty,
} from "@/lib/repositories/party-addresses";
import { getParty } from "@/lib/services/parties";
import { requireUser } from "@/lib/session";
import {
  PartyForm,
  type AddressFormFields,
  type OpeningBalanceDirection,
  type PartyFormInitial,
} from "../../PartyForm";

export const metadata: Metadata = {
  title: "Edit party · AstraBill",
};

function addressRowToFields(
  row: {
    streetAddress: string | null;
    city: string | null;
    stateCode: string | null;
    pincode: string | null;
  } | null,
): AddressFormFields {
  return {
    streetAddress: row?.streetAddress ?? "",
    city: row?.city ?? "",
    stateCode: row?.stateCode ?? "",
    pincode: row?.pincode ?? "",
  };
}

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

  const [billing, shipping, openingEntry, openingLocked] = await Promise.all([
    getBillingAddressForParty(party.id),
    getDefaultShippingAddressForParty(party.id),
    getOpeningBalanceEntryForParty(party.id),
    hasNonOpeningActivityForParty(party.id),
  ]);

  const openingAmount = openingEntry
    ? (openingEntry.debitAmount ?? openingEntry.creditAmount ?? "")
    : "";
  const openingDirection: OpeningBalanceDirection = openingEntry
    ? openingEntry.debitAmount != null
      ? "to_collect"
      : "to_pay"
    : "to_collect";
  const openingAsOfDate =
    openingEntry?.entryDate ?? new Date().toISOString().slice(0, 10);

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
    billing: addressRowToFields(billing),
    shippingSameAsBilling: shipping === null,
    shipping: addressRowToFields(shipping),
    openingBalanceAmount: openingAmount,
    openingBalanceDirection: openingDirection,
    openingBalanceAsOfDate: openingAsOfDate,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${party.name}`} />
      <PartyForm
        businessId={business.id}
        editingPartyId={party.id}
        initial={initial}
        openingBalanceLocked={openingLocked}
      />
    </div>
  );
}
