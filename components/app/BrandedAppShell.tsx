/**
 * BrandedAppShell — the chrome every authed, business-scoped page sits inside.
 *
 * The sidebar carries the *business's* identity (logo, name, brand-colour
 * accent); a small "Powered by AstraBill" sits at the foot so the platform
 * still attributes itself without overpowering the owner's brand.
 *
 * Layout:
 *   - `Sidebar`    — desktop, fixed-width left column (`md` and up).
 *   - `MobileNav`  — below `md`: a top bar + slide-in drawer.
 *   - `main`       — the page body, max-width bounded.
 *
 * Server component. `Sidebar` / `MobileNav` are the client islands — they
 * need `usePathname` + open/close state. All data is fetched once in
 * `/b/[businessId]/layout.tsx` and passed straight through.
 */
import type { ReactNode } from "react";

import { MobileNav } from "@/components/app/MobileNav";
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
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav business={business} businesses={businesses} user={user} />
        <main className="min-w-0 flex-1">
          <div
            className={cn(
              "mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 sm:py-10",
              className,
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
