/**
 * /b/[businessId]/settings/invoice-settings — per-doc-type numbering +
 * default T&C editor.
 *
 * Server component: fetches the current-FY counter rows + the business's
 * doc_type_defaults, hands them to <InvoiceSettingsEditor>. Owner-only
 * (`settings:edit`) — non-owners see read-only.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getMembership, roleHas } from "@/lib/rbac";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import {
  fyTokenFromDate,
  listCountersForBusiness,
} from "@/lib/services/document-counters";
import { requireUser } from "@/lib/session";
import type { DocTypeValue } from "@/lib/db/schema";

import { InvoiceSettingsEditor } from "./InvoiceSettingsEditor";

export const metadata: Metadata = { title: "Invoice Settings" };

export default async function InvoiceSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();
  const membership = await getMembership(user.id, businessId);
  if (!membership) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const fyYear = fyTokenFromDate(today, business.fyStartMonth);

  // Reads scope by membership inside the service — non-owners 403 here.
  // A read on owner-only settings returns nothing meaningful for managers
  // anyway; we surface the editor in read-only mode below.
  const canEdit = roleHas(membership.role, "settings:edit");
  const counters = canEdit
    ? await listCountersForBusiness({
        businessId: business.id,
        actorUserId: user.id,
      })
    : [];

  // Reduce to the current-FY row per doc type — the editor only edits the
  // current FY (prior-FY rows are immutable history).
  const countersByType: Partial<
    Record<DocTypeValue, ReturnType<typeof toCounterRow>>
  > = {};
  for (const row of counters) {
    if (row.fyYear === fyYear) {
      countersByType[row.docType] = toCounterRow(row);
    }
  }

  return (
    <InvoiceSettingsEditor
      businessId={business.id}
      canEdit={canEdit}
      initial={{
        countersByType,
        docTypeDefaults: business.docTypeDefaults ?? {},
        fyYear,
      }}
    />
  );
}

function toCounterRow(row: {
  docType: DocTypeValue;
  fyYear: string;
  prefix: string;
  sequenceTemplate: string;
  nextSequence: number;
  resetEachFy: boolean;
}) {
  return {
    docType: row.docType,
    fyYear: row.fyYear,
    prefix: row.prefix,
    sequenceTemplate: row.sequenceTemplate,
    nextSequence: row.nextSequence,
    resetEachFy: row.resetEachFy,
  };
}
