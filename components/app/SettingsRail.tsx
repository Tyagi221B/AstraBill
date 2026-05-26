"use client";
/**
 * SettingsRail — the primary left rail shown while the user is "inside
 * settings". Takes over the slot normally occupied by the main app
 * <Sidebar> so the screen has one nav column, not two.
 *
 * Three regions, mirroring the main sidebar's shape:
 *   - Header   — business identity (avatar + name + GST badge) + a
 *                "Back to Dashboard" button (the way out of settings mode).
 *   - Nav      — settings sections (Primary group + Advanced group).
 *                Primary group mirrors myBillBook's IA; V2 surfaces carry a
 *                "Soon" chip but stay clickable (URLs reserved).
 *                Advanced group surfaces our domain-specific pages
 *                (Payments, Party categories, etc.) without competing with
 *                the primary set.
 *   - Footer   — UserMenu (sign out) + Powered-by-AstraBill mark.
 *
 * `onNavigate` fires when any nav link is tapped — the mobile drawer uses
 * it to close itself. Desktop callers don't need to pass it.
 *
 * Client component: `usePathname` for active state.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Building2,
  FileBarChart,
  FileText,
  Gift,
  HelpCircle,
  LogOut,
  Printer,
  Receipt,
  Tag,
  UserCircle,
  Users,
} from "lucide-react";
import posthog from "posthog-js";
import { signOut } from "next-auth/react";
import type { ComponentType } from "react";

import { Logo } from "@/components/ui/Logo";
import { BusinessAvatar } from "@/components/app/Sidebar";
import type { Business } from "@/lib/db/schema";
import { routes } from "@/lib/routes";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type RailItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** V2 surfaces render with a "Soon" chip but stay clickable — the
   *  destination is a coming-soon placeholder that lives at the same URL. */
  soon?: boolean;
};

export interface SettingsRailProps {
  business: Business;
  user: SessionUser;
  onNavigate?: () => void;
}

export function SettingsRail({
  business,
  user,
  onNavigate,
}: SettingsRailProps) {
  const pathname = usePathname();
  const s = routes.b(business.id).settings;
  const b = routes.b(business.id);

  const primary: RailItem[] = [
    { label: "Account", href: s.account, icon: UserCircle },
    { label: "Manage Business", href: s.manageBusiness, icon: Building2 },
    { label: "Invoice Settings", href: s.invoiceSettings, icon: Receipt },
    { label: "Print Settings", href: s.printSettings, icon: Printer },
    { label: "Manage Users", href: s.manageUsers, icon: Users, soon: true },
    { label: "Reminders", href: s.reminders, icon: Bell, soon: true },
    { label: "CA Reports Sharing", href: s.caReports, icon: FileBarChart, soon: true },
    { label: "Pricing", href: s.pricing, icon: Tag, soon: true },
    { label: "Refer & Earn", href: s.referEarn, icon: Gift, soon: true },
    { label: "Help & Support", href: s.help, icon: HelpCircle, soon: true },
  ];

  const advanced: RailItem[] = [
    { label: "Payments", href: s.payments, icon: Receipt },
    { label: "Party categories", href: s.partyCategories, icon: Tag },
    { label: "Party fields", href: s.partyCustomFields, icon: FileText },
    { label: "Item categories", href: s.itemCategories, icon: Tag },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full w-full flex-col overflow-y-auto">
      {/* header: business identity + back-to-dashboard */}
      <div className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-1.5">
          <BusinessAvatar business={business} className="h-9 w-9 text-sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {business.name}
            </div>
            <div className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
              {business.gstin ? "GST · Registered" : "Estimates · Cash"}
            </div>
          </div>
        </div>
        <Link
          href={b.dashboard}
          onClick={onNavigate}
          className="mt-2 flex items-center gap-2 rounded-md border border-sidebar-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {/* nav */}
      <nav
        aria-label="Settings sections"
        className="flex flex-1 flex-col gap-5 px-3 py-4"
      >
        <NavGroup label="Settings">
          {primary.map((item) => (
            <RailLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </NavGroup>
        <NavGroup label="Advanced">
          {advanced.map((item) => (
            <RailLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </NavGroup>
      </nav>

      {/* footer: user menu + powered-by mark */}
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

function RailLink({
  item,
  active,
  onNavigate,
}: {
  item: RailItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.soon && (
        <span className="rounded-sm bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Soon
        </span>
      )}
    </Link>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const handleSignOut = () => {
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
      <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-foreground">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span>{initials || "?"}</span>
        )}
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
