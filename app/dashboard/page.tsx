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
 * Cache-shape (Phase 2.2): the outer page is sync; the redirect work
 * happens inside an async `<DashboardRedirect>` child wrapped in
 * Suspense. The fallback is a minimal centered spinner — visible for
 * ~100ms while the membership lookup runs before the redirect fires.
 * Under cacheComponents, mid-stream `redirect()` becomes a client-side
 * navigation; the spinner covers that handoff cleanly.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getMostRecentBusinessForUser } from "@/lib/services/businesses";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export default function DashboardEntryPage() {
  return (
    <Suspense fallback={<RedirectPending />}>
      <DashboardRedirect />
    </Suspense>
  );
}

async function DashboardRedirect(): Promise<null> {
  const user = await requireUser();
  const recent = await getMostRecentBusinessForUser(user.id);

  if (!recent) {
    redirect(routes.onboarding);
  }
  redirect(routes.b(recent.business.id).dashboard);
}

function RedirectPending() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        <p className="text-sm">Opening your dashboard…</p>
      </div>
    </div>
  );
}
