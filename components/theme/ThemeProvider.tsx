"use client";
/**
 * next-themes wrapper. `attribute="class"` toggles `.dark` on <html>, which
 * is what the `@custom-variant dark` rule in globals.css keys off. System
 * preference is the default; the user's explicit choice is persisted.
 */
import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
