/**
 * /dashboard — the smart entry point after sign-in.
 *
 * Three branches:
 *   - No business yet            → /onboarding (set up the first one)
 *   - One (or many) businesses   → /b/[mostRecent]/dashboard
 *
 * "Most recent" = most-recently-joined membership (see
 * `getMostRecentBusinessForUser`). Tracking *most-recently-used* is a
 * follow-up — needs a `users.last_business_id` column updated on every
 * business switch.
 *
 * Why a redirect and not a picker:
 *   - The picker is now inside the branded sidebar (BusinessSwitcher).
 *   - A "land in your business immediately" feel is the whole point of
 *     Phase 2D (the app should feel like the owner's billing dashboard
 *     from the first frame, not a tenant chooser).
 *
 * The proxy already gates this route; the explicit `requireUser` here is
 * defence-in-depth (and gives us a typed user object).
 */
import { redirect } from "next/navigation";

import { getMostRecentBusinessForUser } from "@/lib/services/businesses";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export default async function DashboardEntryPage() {
  const user = await requireUser();
  const recent = await getMostRecentBusinessForUser(user.id);

  if (!recent) {
    redirect(routes.onboarding);
  }
  redirect(routes.b(recent.business.id).dashboard);
}
