/**
 * `/b/[businessId]/...` layout — the ONE place a business is resolved + the
 * caller's membership in it is verified, for every business-scoped page.
 *
 * Why this lives here (and nowhere else):
 *   - Single source of truth: pages under this segment never re-fetch the
 *     business or re-check membership; they read from props/context the
 *     layout provides via the AppShell.
 *   - Tenant isolation: a user with no membership in `businessId` gets the
 *     same 404 a stranger gets — no existence leak. The service-layer
 *     repository checks are still in place (defence in depth), but the
 *     layout is the early-return tripwire.
 *
 * The 404 is intentional (not "Forbidden") for the same no-existence-leak
 * reason: someone fishing for valid business UUIDs gets nothing back.
 */
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BrandedAppShell } from "@/components/app/BrandedAppShell";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";

export default async function BusinessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  // Active business: 404 covers both "doesn't exist" and "not a member" —
  // the repository returns null for both, on purpose.
  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  // The switcher needs the full list. One extra query — acceptable, the
  // sidebar is part of every page render anyway.
  const businesses = await listBusinessesForUser(user.id);

  return (
    <BrandedAppShell
      business={business}
      businesses={businesses}
      user={user}
    >
      {children}
    </BrandedAppShell>
  );
}
