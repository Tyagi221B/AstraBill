/**
 * /b/[businessId]/settings/print-settings — invoice design + branding.
 *
 * Renamed from /settings/branding to match the myBillBook IA. The editor
 * is the same — template, colour, font, column visibility, logo. The
 * "Branding" name is gone from the rail; print-settings is the canonical
 * surface for everything that affects how a printed/PDF document looks.
 *
 * Server component: resolves the business from the path, hands its current
 * print profile to the client <PrintSettingsEditor>. Membership is verified
 * by the parent layout.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { DEFAULT_DOCUMENT_SETTINGS } from "@/lib/db/schema";
import { getMembership, roleHas } from "@/lib/rbac";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { requireUser } from "@/lib/session";
import { PrintSettingsEditor } from "./PrintSettingsEditor";

export const metadata: Metadata = { title: "Print Settings" };

export default async function PrintSettingsPage({
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
        <h2 className="text-xl font-semibold tracking-tight">
          Print Settings
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How {business.name}&rsquo;s invoices look — template, colour, font,
          and which columns appear on the printed bill.
        </p>
      </div>
      <PrintSettingsEditor
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
