/**
 * /b/[businessId]/settings — shared chrome for every page under settings.
 *
 * Renders:
 *   - <PageHeader title="Settings"> at the top — every settings sub-page
 *     inherits this; sub-pages render their OWN section title inside the
 *     content area.
 *   - <SettingsRail> on the left — the secondary nav.
 *   - {children} on the right — the active sub-page's content.
 *
 * Membership is already verified by the parent `/b/[businessId]/layout.tsx`;
 * we only re-fetch the business here to surface its name in the header
 * subtitle.
 */
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/PageHeader";
import { SettingsRail } from "@/components/app/SettingsRail";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { requireUser } from "@/lib/session";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  return (
    <>
      <PageHeader
        title="Settings"
        description={`How ${business.name}’s business profile, invoices, and account behave.`}
      />
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <SettingsRail businessId={business.id} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
