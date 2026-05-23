/**
 * /b/[businessId]/parties/[id] — party detail (Profile tab).
 *
 * Step 2 ships the Profile surface only. Transactions + Ledger tabs are
 * placeholders — wired in Step 5 (documents pipeline) and Step 7 (payment
 * recording) respectively.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import {
  balanceForParty,
  getOpeningBalanceEntryForParty,
} from "@/lib/repositories/ledger-entries";
import {
  getBillingAddressForParty,
  getDefaultShippingAddressForParty,
} from "@/lib/repositories/party-addresses";
import { listPartyCategoriesForUser } from "@/lib/repositories/party-categories";
import { CASH_SALE_PARTY_NAME, getParty } from "@/lib/services/parties";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";
import { DeletePartyButton } from "./DeletePartyButton";

const fmt = (n: number | string) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const metadata: Metadata = { title: "Party · AstraBill" };

export default async function PartyDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const user = await requireUser();
  const { businessId, id } = await params;
  const party = await getParty(id, user.id);
  if (!party || party.businessId !== businessId) notFound();
  const b = routes.b(businessId);

  const [billing, shipping, balanceStr, openingEntry, categories] =
    await Promise.all([
      getBillingAddressForParty(party.id),
      getDefaultShippingAddressForParty(party.id),
      balanceForParty(party.id),
      getOpeningBalanceEntryForParty(party.id),
      listPartyCategoriesForUser({ userId: user.id, businessId }),
    ]);
  const category = party.categoryId
    ? categories.find((c) => c.id === party.categoryId) ?? null
    : null;

  const balance = Number(balanceStr);
  const openingAmount = openingEntry
    ? (openingEntry.debitAmount ?? openingEntry.creditAmount ?? "0")
    : null;
  const openingDirection: "to_collect" | "to_pay" | null = openingEntry
    ? openingEntry.debitAmount != null
      ? "to_collect"
      : "to_pay"
    : null;

  const isCashSale = party.name === CASH_SALE_PARTY_NAME;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span>{party.name}</span>
            <Badge tone={party.type === "supplier" ? "warning" : "info"}>
              {party.type}
            </Badge>
            {category && <Badge tone="neutral">{category.name}</Badge>}
            {isCashSale && (
              <Badge tone="neutral">walk-in (system)</Badge>
            )}
          </span>
        }
        action={
          <>
            {!isCashSale && (
              <Link
                href={b.editParty(party.id)}
                className={buttonClasses("outline", "sm")}
              >
                Edit
              </Link>
            )}
            <DeletePartyButton
              partyId={party.id}
              businessId={businessId}
              disabled={isCashSale}
            />
          </>
        }
      />

      {!isCashSale && (
        <Card className="mb-5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Current balance
              </p>
              <p
                className={`mt-1 text-3xl font-semibold tabular-nums ${
                  balance > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : balance < 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-foreground"
                }`}
              >
                {balance === 0 ? "₹0" : fmt(Math.abs(balance))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {balance > 0
                  ? "To collect — party owes you"
                  : balance < 0
                    ? "To pay — you owe party"
                    : "Settled"}
              </p>
            </div>
            {openingAmount && Number(openingAmount) !== 0 && (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Opening balance
                </p>
                <p className="mt-1 text-base font-medium tabular-nums text-foreground">
                  {fmt(openingAmount)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {openingDirection === "to_collect" ? "to collect" : "to pay"}
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">General details</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              <Field label="Type" value={party.type} capitalize />
              <Field label="Mobile" value={party.mobileNumber} />
              <Field label="Email" value={party.email} />
              <Field label="Notes" value={party.notes} className="sm:col-span-2" />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">GST &amp; PAN</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              <Field label="GSTIN" value={party.gstin} mono />
              <Field label="PAN" value={party.panNumber} mono />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Credit terms</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              <Field
                label="Credit period"
                value={`${party.creditPeriodDays} days`}
              />
              <Field label="Credit limit" value={`₹ ${party.creditLimit}`} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Contact person</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              <Field label="Name" value={party.contactPersonName} />
              <Field label="Date of birth" value={party.contactPersonDob} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Billing address</h2>
            <AddressBlock address={billing} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold">Shipping address</h2>
            {shipping ? (
              <AddressBlock address={shipping} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Same as billing
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            Transactions &amp; ledger
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            This party's invoice history and running balance arrive in the
            next steps of the full-ledger build (documents pipeline + payment
            recording).
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function AddressBlock({
  address,
}: {
  address: {
    streetAddress: string | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    pincode: string | null;
  } | null;
}) {
  if (!address) {
    return (
      <p className="text-sm text-muted-foreground">No address on file</p>
    );
  }
  const cityPin = [address.city, address.pincode].filter(Boolean).join(" ");
  const stateLine = address.state
    ? address.stateCode
      ? `${address.state} (${address.stateCode})`
      : address.state
    : null;
  const lines = [address.streetAddress, cityPin || null, stateLine].filter(
    Boolean,
  ) as string[];
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No address on file</p>
    );
  }
  return (
    <address className="not-italic text-sm leading-relaxed text-foreground">
      {lines.map((line, idx) => (
        <div key={idx}>{line}</div>
      ))}
    </address>
  );
}

function Field({
  label,
  value,
  mono,
  capitalize,
  className,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  capitalize?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={[
          "mt-0.5",
          mono ? "font-mono" : "",
          capitalize ? "capitalize" : "",
          value ? "text-foreground" : "",
        ].join(" ")}
      >
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
