"use client";
/**
 * Compact theme toggle for the sidebar UserMenu row. Same `next-themes`
 * mechanics as `<ThemeToggle>` (used on marketing + sign-in pages), but
 * styled to match the adjacent sign-out button — `p-1.5` padding,
 * muted-foreground default, hover swaps to foreground.
 *
 * Renders a placeholder of the same size pre-mount so we don't trigger
 * a hydration mismatch from the theme being unknown server-side.
 */
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function SidebarThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {!mounted ? (
        <span aria-hidden className="block h-4 w-4" />
      ) : isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
