"use client";
/**
 * Toaster — sonner mounted with our theme tokens.
 *
 * One mount at the root of `app/layout.tsx` is enough — every `toast.*()` call
 * anywhere in the tree feeds this single instance. Theme follows next-themes
 * so a dark-mode user gets dark toasts (sonner's "system" reads `.dark` on
 * <html>, which `next-themes` is configured to set in ThemeProvider).
 *
 * Position bottom-right matches the conventional Vercel/Linear placement; on
 * mobile sonner falls back to top-center automatically.
 */
import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      position="bottom-right"
      theme={(resolvedTheme as "light" | "dark") ?? "light"}
      richColors
      closeButton
      toastOptions={{
        // Slightly tighter than sonner's defaults — matches our card/border
        // radius so toasts read as the same surface family.
        classNames: {
          toast: "rounded-lg border border-border shadow-md",
        },
      }}
    />
  );
}
