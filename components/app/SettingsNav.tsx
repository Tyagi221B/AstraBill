/**
 * SettingsNav — the inline tab strip shared by every page under
 * `/b/[businessId]/settings/...`. One client component because the active
 * tab depends on `usePathname()`.
 *
 * Each settings page renders <SettingsNav businessId={id} /> just below the
 * <PageHeader>. The tabs are wired to typed `routes.b(id).settings.*`
 * paths so renames bubble through one file.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function SettingsNav({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const s = routes.b(businessId).settings;
  const tabs = [
    { label: "Branding", href: s.branding },
    { label: "Payments", href: s.payments },
    { label: "Party categories", href: s.partyCategories },
    { label: "Item categories", href: s.itemCategories },
  ] as const;

  return (
    <nav
      aria-label="Settings sections"
      className="mb-5 flex gap-1 border-b border-border"
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
