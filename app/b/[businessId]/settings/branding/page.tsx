/**
 * /b/[businessId]/settings/branding — invoice design + branding (Phase 2C).
 *
 * Server component: resolves the business from the path, hands its current
 * branding to the client <BrandingEditor>. Membership is verified by the
 * parent layout; the business switcher is the sidebar's job now, so there's
 * no in-page switcher.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { SettingsNav } from "@/components/app/SettingsNav";
import { DEFAULT_DOCUMENT_SETTINGS } from "@/lib/db/schema";
import { getMembership, roleHas } from "@/lib/rbac";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { requireUser } from "@/lib/session";
import { BrandingEditor } from "./BrandingEditor";

export const metadata: Metadata = { title: "Invoice branding" };

export default async function BrandingSettingsPage({
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

  return (
    <>
      <PageHeader
        title="Settings"
        description={`How ${business.name}’s invoices look and how customers pay you.`}
      />
      <SettingsNav businessId={business.id} />
      <BrandingEditor
        businessId={business.id}
        canEdit={roleHas(membership.role, "settings:edit")}
        isFreePlan={business.plan === "free"}
        initial={{
          template: business.documentTemplateId,
          color: business.brandColor,
          font: business.brandFont,
          logoUrl: business.logoUrl,
          columns:
            business.documentSettings?.columns ??
            DEFAULT_DOCUMENT_SETTINGS.columns,
        }}
      />
    </>
  );
}
