import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  getOpeningBalanceEntryForParty,
  hasNonOpeningActivityForParty,
} from "@/lib/repositories/ledger-entries";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import {
  getBillingAddressForParty,
  getDefaultShippingAddressForParty,
} from "@/lib/repositories/party-addresses";
import { listShippingAddressesForParty } from "@/lib/repositories/party-addresses";
import { listPartyBankAccountsForParty } from "@/lib/repositories/party-bank-accounts";
import { listPartyCategoriesForUser } from "@/lib/repositories/party-categories";
import {
  listPartyCustomFieldDefsForUser,
  listPartyCustomFieldValues,
} from "@/lib/repositories/party-custom-fields";
import { getParty } from "@/lib/services/parties";
import { PartyBankAccountsPanel } from "./PartyBankAccountsPanel";
import { PartyShippingAddressesPanel } from "./PartyShippingAddressesPanel";
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

  const [
    billing,
    shipping,
    openingEntry,
    openingLocked,
    categories,
    banks,
    shippingAddresses,
    customFieldDefinitions,
    customFieldValues,
  ] = await Promise.all([
    getBillingAddressForParty(party.id),
    getDefaultShippingAddressForParty(party.id),
    getOpeningBalanceEntryForParty(party.id),
    hasNonOpeningActivityForParty(party.id),
    listPartyCategoriesForUser({ userId: user.id, businessId }),
    listPartyBankAccountsForParty(party.id),
    listShippingAddressesForParty(party.id),
    listPartyCustomFieldDefsForUser({ userId: user.id, businessId }),
    listPartyCustomFieldValues(party.id),
  ]);
  const customFieldValuesMap: Record<string, string> = {};
  for (const v of customFieldValues) {
    customFieldValuesMap[v.definitionId] = v.value ?? "";
  }

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
    categoryId: party.categoryId ?? "",
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
    customFieldValues: customFieldValuesMap,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${party.name}`} />
      <PartyForm
        businessId={business.id}
        editingPartyId={party.id}
        initial={initial}
        openingBalanceLocked={openingLocked}
        categories={categories}
        customFieldDefinitions={customFieldDefinitions}
      />
      <Card className="mt-5">
        <CardContent className="pt-6">
          <h2 className="mb-1 text-base font-semibold">Shipping addresses</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Multiple ship-to addresses per party (e.g. warehouse, branch).
            The default is auto-picked on new invoices; you can override
            per-invoice. Saved independently of the form above.
          </p>
          <PartyShippingAddressesPanel
            partyId={party.id}
            initial={shippingAddresses}
          />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="pt-6">
          <h2 className="mb-1 text-base font-semibold">Bank accounts</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Banks are saved independently of the party form above — each
            add / edit / delete commits straight away. The default bank
            shows on this party's payment-out flow.
          </p>
          <PartyBankAccountsPanel partyId={party.id} initial={banks} />
        </CardContent>
      </Card>
    </div>
  );
}
