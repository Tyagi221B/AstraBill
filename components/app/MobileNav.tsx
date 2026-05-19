/**
 * MobileNav — the navigation chrome below the `md` breakpoint, where the
 * desktop `Sidebar` is hidden.
 *
 *   - A sticky top bar: hamburger + business avatar + name.
 *   - A slide-in drawer (left) holding the full `SidebarContent`.
 *
 * The drawer is always mounted; `pointer-events-none` + opacity/transform
 * toggle it, so it slides and fades rather than popping. Tapping a nav link
 * closes it via `SidebarContent`'s `onNavigate`. Body scroll is locked while
 * it's open.
 *
 * Client component — owns the open/closed state.
 */
"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";

import { BusinessAvatar, SidebarContent, type SidebarProps } from "./Sidebar";
import { cn } from "@/lib/utils";

export function MobileNav({ business, businesses, user }: SidebarProps) {
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
          {business.name}
        </span>
      </header>

      {/* Drawer — always mounted; toggled via opacity + transform. */}
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
          <SidebarContent
            business={business}
            businesses={businesses}
            user={user}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </div>
    </>
  );
}
