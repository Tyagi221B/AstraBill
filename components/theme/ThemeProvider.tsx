"use client";
/**
 * next-themes wrapper. `attribute="class"` toggles `.dark` on <html>, which
 * is what the `@custom-variant dark` rule in globals.css keys off.
 *
 * `defaultTheme="light"` (not "system") — Phase 2E (UI refinement) targets a
 * Zoho-like light aesthetic, and most laptops default the OS to dark.
 * Defaulting to system would give new users dark on first paint, which
 * works against the "calm, generous, professional first impression" we want
 * for Indian SME owners landing on AstraBill. The user-facing toggle still
 * exposes light / dark / system; an explicit choice is persisted.
 */
import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
