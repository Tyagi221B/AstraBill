"use client";
/**
 * BrandedAppShell — the chrome every authed, business-scoped page sits inside.
 *
 * The sidebar slot has two modes, swapped based on the active pathname:
 *   - Default      — the main app <Sidebar> (Dashboard / Parties / Items / …).
 *   - Settings     — the <SettingsRail> takes the same slot, with a
 *                    "Back to Dashboard" button at the top. Replaces the
 *                    main rail rather than rendering beside it, so the
 *                    screen has one nav column, not two.
 *
 * The mobile drawer follows the same rule — when inside settings, the
 * drawer renders the SettingsRail. The slide-in + body-scroll-lock UX
 * matches the desktop chrome.
 *
 * Client component because the path check is `usePathname()`; the data
 * (business, businesses, user) is still fetched once in
 * `/b/[businessId]/layout.tsx` and passed straight through.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { BusinessAvatar, SidebarContent } from "@/components/app/Sidebar";
import { SettingsRail } from "@/components/app/SettingsRail";
import type { Business, BusinessMember } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export interface BrandedAppShellProps {
  business: Business;
  businesses: Array<{ business: Business; membership: BusinessMember }>;
  user: SessionUser;
  children: React.ReactNode;
  className?: string;
}

export function BrandedAppShell({
  business,
  businesses,
  user,
  children,
  className,
}: BrandedAppShellProps) {
  const pathname = usePathname();
  const inSettings = pathname.startsWith(`/b/${business.id}/settings`);

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* desktop sidebar — same slot, content swaps based on path */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-sidebar-border md:flex">
        {inSettings ? (
          <SettingsRail business={business} user={user} />
        ) : (
          <SidebarContent
            business={business}
            businesses={businesses}
            user={user}
          />
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar
          business={business}
          businesses={businesses}
          user={user}
          inSettings={inSettings}
        />
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

// ---- mobile top bar + drawer ------------------------------------------

function MobileTopBar({
  business,
  businesses,
  user,
  inSettings,
}: {
  business: Business;
  businesses: Array<{ business: Business; membership: BusinessMember }>;
  user: SessionUser;
  inSettings: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="bg-background sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <BusinessAvatar business={business} className="h-7 w-7 text-xs" />
        <span className="min-w-0 truncate text-sm font-semibold">
          {inSettings ? "Settings" : business.name}
        </span>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-200 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          className="absolute inset-0 bg-black/40"
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-sidebar-border shadow-xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {inSettings ? (
            <SettingsRail
              business={business}
              user={user}
              onNavigate={() => setOpen(false)}
            />
          ) : (
            <SidebarContent
              business={business}
              businesses={businesses}
              user={user}
              onNavigate={() => setOpen(false)}
            />
          )}
        </div>
      </div>
    </>
  );
}

