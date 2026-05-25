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
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Branding</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How {business.name}&rsquo;s invoices look — template, colour, font,
          and which columns appear on the printed bill.
        </p>
      </div>
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
    </div>
  );
}
