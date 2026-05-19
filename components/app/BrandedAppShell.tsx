/**
 * BrandedAppShell — the chrome every authed, business-scoped page sits inside.
 *
 * Replaces the older `AppShell` for pages under `/b/[businessId]/...`. The
 * sidebar carries the *business's* identity (logo, name, brand colour
 * accent); a small "Powered by AstraBill" sits at the foot so the platform
 * still attributes itself without overpowering the owner's brand.
 *
 * Server component. The `Sidebar` is the only client island — it needs
 * `usePathname` and dropdown state. All data is fetched once in the
 * `/b/[businessId]/layout.tsx` and passed straight through.
 */
import type { ReactNode } from "react";

import { Sidebar } from "@/components/app/Sidebar";
import type { Business, BusinessMember } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export function BrandedAppShell({
  business,
  businesses,
  user,
  children,
  className,
}: {
  business: Business;
  businesses: Array<{ business: Business; membership: BusinessMember }>;
  user: SessionUser;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <Sidebar business={business} businesses={businesses} user={user} />
      <main className="min-w-0 flex-1">
        <div className={cn("mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 sm:py-10", className)}>
          {children}
        </div>
      </main>
    </div>
  );
}
