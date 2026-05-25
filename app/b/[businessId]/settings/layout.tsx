/**
 * /b/[businessId]/settings — shared chrome for every settings sub-page.
 *
 * Renders nothing structural anymore — the path-aware `BrandedAppShell`
 * (set up by the parent business layout) already swapped the main app
 * sidebar for the SettingsRail when the user opened a settings URL. This
 * layout just verifies membership and forwards children.
 *
 * Existing in-content section headers (each settings sub-page renders its
 * own H2 + description) provide the per-page title — the shell's PageHeader
 * is intentionally absent on settings pages.
 */
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

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

  return <>{children}</>;
}
