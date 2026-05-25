/**
 * App sidebar content — the inner body of the main nav rail.
 *
 * Three regions, top to bottom:
 *   - BusinessSwitcher  — current business at top; click to swap or add one
 *   - Nav               — Dashboard / Invoices / Customers / Products / Settings
 *   - Footer            — user identity, sign-out, "Powered by AstraBill"
 *
 * `SidebarContent` is what `BrandedAppShell` renders inside its
 * desktop `<aside>` slot AND its mobile drawer when the user is OUTSIDE
 * settings. When inside settings, `SettingsRail` takes the same slots.
 * The `onNavigate` callback lets the mobile drawer close itself on tap.
 *
 * Branding strategy: restrained. The brand colour shows on (1) the active
 * nav item's left edge, (2) the business avatar fallback. The rest stays
 * neutral so the data area reads cleanly whatever colour the shop picked.
 *
 * Client component: `usePathname` for active-state + dropdown state. All
 * heavy data (business list) is computed on the server and passed in.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Banknote,
  BarChart3,
  Boxes,
  Check,
  ChevronsUpDown,
  Contact,
  FileInput,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings,
} from "lucide-react";
import posthog from "posthog-js";
import { signOut } from "next-auth/react";

import { Logo } from "@/components/ui/Logo";
import type { Business, BusinessMember } from "@/lib/db/schema";
import { routes } from "@/lib/routes";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  business: Business;
  businesses: Array<{ business: Business; membership: BusinessMember }>;
  user: SessionUser;
}

/** The sidebar body — used inside the desktop `<aside>` slot and the
 *  mobile drawer of `BrandedAppShell`. The shell owns the framing
 *  (`sticky`, `h-dvh`, width, border); this component is just the inner
 *  scroll body.
 *  `onNavigate` fires when any nav/switcher link is followed, so the mobile
 *  drawer can close itself. */
export function SidebarContent({
  business,
  businesses,
  user,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const b = routes.b(business.id);

  // Nav structured into IA groups matching the books model.
  //   General  — daily-use pages (dashboard, parties, items, cash & bank).
  //   Sales    — outward documents.
  //   Purchases — inward documents.
  //   Insights — reports.
  //   Settings — knobs.
  const generalItems = [
    { label: "Dashboard", path: b.dashboard, icon: LayoutDashboard },
    { label: "Parties", path: b.parties, icon: Contact },
    { label: "Items", path: b.items, icon: Boxes },
    { label: "Cash & Bank", path: b.cashAndBank, icon: Banknote },
  ] as const;
  const salesItems = [
    { label: "Sales invoices", path: b.salesInvoices, icon: ReceiptText },
    { label: "Quotations", path: b.quotations, icon: FileText },
    { label: "Credit notes", path: b.creditNotes, icon: RotateCcw },
  ] as const;
  const purchaseItems = [
    { label: "Purchase invoices", path: b.purchaseInvoices, icon: FileInput },
    { label: "Debit notes", path: b.debitNotes, icon: RotateCcw },
  ] as const;
  const insightsItems = [
    { label: "Reports", path: b.reports, icon: BarChart3 },
  ] as const;
  const settingsItems = [
    { label: "Settings", path: b.settings.index, icon: Settings },
  ] as const;

  type NavItem =
    | (typeof generalItems)[number]
    | (typeof salesItems)[number]
    | (typeof purchaseItems)[number]
    | (typeof insightsItems)[number]
    | (typeof settingsItems)[number];

  const renderNavLink = (item: NavItem) => {
    // Exact match for the dashboard so it isn't also lit on /b/[id]/x.
    // Everything else uses prefix match so deep links inside a section
    // (e.g. /invoices/[id]/edit) keep the parent nav item active.
    const isActive =
      item.path === b.dashboard
        ? pathname === b.dashboard
        : pathname === item.path || pathname.startsWith(`${item.path}/`);
    return (
      <Link
        key={item.path}
        href={item.path}
        onClick={onNavigate}
        className={cn(
          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r"
            style={{ backgroundColor: business.brandColor }}
          />
        )}
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full w-full flex-col overflow-y-auto">
      <BusinessSwitcher
        business={business}
        businesses={businesses}
        onNavigate={onNavigate}
      />

      <nav className="flex flex-1 flex-col gap-5 px-3 py-4">
        <NavGroup label="General">{generalItems.map(renderNavLink)}</NavGroup>
        <NavGroup label="Sales">{salesItems.map(renderNavLink)}</NavGroup>
        <NavGroup label="Purchases">
          {purchaseItems.map(renderNavLink)}
        </NavGroup>
        <NavGroup label="Insights">
          {insightsItems.map(renderNavLink)}
        </NavGroup>
        <NavGroup label="Settings">
          {settingsItems.map(renderNavLink)}
        </NavGroup>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <UserMenu user={user} />
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <span>Powered by</span>
          <Logo variant="wordmark" className="h-3 w-auto opacity-70" />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      {children}
    </div>
  );
}

function BusinessSwitcher({
  business,
  businesses,
  onNavigate,
}: {
  business: Business;
  businesses: Array<{ business: Business; membership: BusinessMember }>;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasMore = businesses.length > 1;

  return (
    <div className="relative border-b border-sidebar-border p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted"
      >
        <BusinessAvatar business={business} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {business.name}
          </div>
          <div className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {business.gstin ? "GST · Registered" : "Estimates · Cash"}
          </div>
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="bg-popover absolute left-3 right-3 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border shadow-lg"
          >
            {hasMore && (
              <div className="max-h-64 overflow-y-auto py-1">
                {businesses.map(({ business: b }) => (
                  <Link
                    key={b.id}
                    role="menuitem"
                    href={routes.b(b.id).dashboard}
                    onClick={() => {
                      setOpen(false);
                      onNavigate?.();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <BusinessAvatar business={b} className="h-6 w-6 text-[10px]" />
                    <span className="flex-1 truncate">{b.name}</span>
                    {b.id === business.id && (
                      <Check className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Link>
                ))}
              </div>
            )}
            <Link
              role="menuitem"
              href={routes.onboarding}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                hasMore && "border-t border-border",
              )}
            >
              <Plus className="h-4 w-4" />
              Add business
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */

/** Business logo, or a brand-coloured initials tile when no logo is set. */
export function BusinessAvatar({
  business,
  className,
}: {
  business: Business;
  className?: string;
}) {
  if (business.logoUrl) {
    // Plain <img>: the URL is Cloudinary (validated server-side) and the
    // avatar is tiny — next/image's optimization isn't worth the
    // remoteImages config burden here.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={business.logoUrl}
        alt={business.name}
        className={cn("rounded-md object-cover", className)}
      />
    );
  }
  const initials = business.name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: business.brandColor }}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

/* --------------------------------------------------------------------- */

function UserMenu({ user }: { user: SessionUser }) {
  const handleSignOut = () => {
    // Reset PostHog before NextAuth redirects, so future events on this
    // device aren't grouped with the just-signed-out user.
    posthog.reset();
    signOut({ callbackUrl: routes.home });
  };
  const label = user.name ?? user.email ?? "Account";
  const initials = label
    .split(/[\s@]+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-foreground">
        {initials || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{label}</div>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        title="Sign out"
        aria-label="Sign out"
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
