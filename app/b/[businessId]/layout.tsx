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
 *
 * Phase 2.2 — Cache Components shape:
 *   The outer layout is sync (NO `await`) so Next can include it in the
 *   static shell. All dynamic work — membership check, business lookup,
 *   business-list fetch — happens inside `<AuthedShell>`, an inner async
 *   component wrapped in `<Suspense>`. While that resolves, users see the
 *   `<AppShellFallback>` static skeleton — full chrome dimensions, zero CLS.
 *   When the await completes, the real shell streams in.
 */
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { BackgroundGlow } from "@/components/app/BackgroundGlow";
import { BrandedAppShell } from "@/components/app/BrandedAppShell";
import {
  AvatarSkeleton,
  CardSkeleton,
  PageHeaderSkeleton,
} from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";

export default function BusinessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <AuthedShell params={params}>{children}</AuthedShell>
    </Suspense>
  );
}

async function AuthedShell({
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

/**
 * Static shell shown while `AuthedShell` resolves the user + business +
 * businesses list. Mirrors `BrandedAppShell`'s frame exactly (sidebar
 * width, content padding, background glow) so the swap from skeleton →
 * real shell is dimensionally identical — no layout shift.
 *
 * Page-specific `loading.tsx` files below this layout take over after
 * the shell resolves; this fallback is only on screen for the few ms
 * until the membership check + business fetch complete.
 */
function AppShellFallback() {
  return (
    <div className="relative flex min-h-dvh bg-background text-foreground">
      <BackgroundGlow />
      <aside className="bg-sidebar/95 sticky top-0 z-10 hidden h-dvh w-64 shrink-0 border-r border-sidebar-border backdrop-blur-sm md:flex">
        <div className="flex h-full w-full flex-col p-3">
          <div className="flex items-center gap-2.5 p-1.5">
            <AvatarSkeleton size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2 px-1">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </div>
      </aside>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 sm:py-10">
            <PageHeaderSkeleton />
            <CardSkeleton lines={5} />
          </div>
        </main>
      </div>
    </div>
  );
}
