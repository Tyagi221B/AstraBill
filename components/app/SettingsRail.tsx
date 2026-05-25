"use client";
/**
 * SettingsRail — the secondary left-rail nav rendered inside the Settings
 * layout. The main sidebar (Dashboard / Items / ...) sits to its left; this
 * rail is the navigation INSIDE the settings surface.
 *
 * Mirrors myBillBook's settings IA so users coming from there land somewhere
 * familiar. V2 items render today with a "Soon" chip — the URLs are
 * reserved so the chrome stays stable across launches.
 *
 * Below the `md` breakpoint the rail collapses into a horizontal scroll-strip
 * at the top of the page — same destinations, just a different shape so it
 * doesn't eat half the screen on a phone.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  FileBarChart,
  FileText,
  Gift,
  HelpCircle,
  Printer,
  Receipt,
  Tag,
  UserCircle,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

type RailItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** V2 surfaces render with a "Soon" chip but stay clickable — the
   *  destination is a coming-soon placeholder that lives at the same URL. */
  soon?: boolean;
};

export function SettingsRail({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const s = routes.b(businessId).settings;

  const primary: RailItem[] = [
    { label: "Account", href: s.account, icon: UserCircle, soon: true },
    { label: "Manage Business", href: s.manageBusiness, icon: Building2 },
    { label: "Invoice Settings", href: s.invoiceSettings, icon: Receipt, soon: true },
    { label: "Print Settings", href: s.printSettings, icon: Printer, soon: true },
    { label: "Manage Users", href: s.manageUsers, icon: Users, soon: true },
    { label: "Reminders", href: s.reminders, icon: Bell, soon: true },
    { label: "CA Reports Sharing", href: s.caReports, icon: FileBarChart, soon: true },
    { label: "Pricing", href: s.pricing, icon: Tag, soon: true },
    { label: "Refer & Earn", href: s.referEarn, icon: Gift, soon: true },
    { label: "Help & Support", href: s.help, icon: HelpCircle, soon: true },
  ];

  // Domain surfaces that already exist — folded into an "Advanced" tray at the
  // bottom of the rail so they're reachable from the UI but don't compete with
  // the primary set above (which mirrors the myBillBook IA).
  const advanced: RailItem[] = [
    { label: "Branding", href: s.branding, icon: Printer },
    { label: "Payments", href: s.payments, icon: Receipt },
    { label: "Party categories", href: s.partyCategories, icon: Tag },
    { label: "Party fields", href: s.partyCustomFields, icon: FileText },
    { label: "Item categories", href: s.itemCategories, icon: Tag },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* desktop: vertical rail */}
      <aside
        aria-label="Settings sections"
        className="hidden w-60 shrink-0 md:block"
      >
        <nav className="flex flex-col gap-1">
          {primary.map((item) => (
            <RailLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4">
          <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Advanced
          </div>
          <nav className="flex flex-col gap-1">
            {advanced.map((item) => (
              <RailLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
              />
            ))}
          </nav>
        </div>
      </aside>

      {/* mobile: horizontal scroll strip */}
      <nav
        aria-label="Settings sections"
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 md:hidden"
      >
        {[...primary, ...advanced].map((item) => (
          <RailChip key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
    </>
  );
}

function RailLink({ item, active }: { item: RailItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
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

function RailChip({ item, active }: { item: RailItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      <span>{item.label}</span>
      {item.soon && (
        <span className="rounded-sm bg-muted px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          Soon
        </span>
      )}
    </Link>
  );
}
