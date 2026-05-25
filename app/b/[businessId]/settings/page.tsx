/**
 * /b/[businessId]/settings — the rail is never empty: this index redirects
 * to Manage Business, which is the most-used surface (the dense profile
 * form). When a user opens "Settings" from the main sidebar they land here.
 */
import { redirect } from "next/navigation";

import { routes } from "@/lib/routes";

export default async function SettingsIndexPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  redirect(routes.b(businessId).settings.manageBusiness);
}
