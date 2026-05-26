/**
 * /b/[businessId]/settings — shared chrome for every settings sub-page.
 *
 * Renders nothing structural — the path-aware `BrandedAppShell` (set up by
 * the parent business layout) already swapped the main app sidebar for the
 * SettingsRail when the user opened a settings URL. The parent business
 * layout already resolved membership (see [[decision/white-label-app-shell]]
 * — "Membership resolution: Resolved exactly ONCE per request").
 *
 * This layout exists only so Next picks up the per-segment folder; it's a
 * passthrough. NO `await` here — adding any would re-run the membership
 * check the parent just did AND make every settings page dynamic-at-layout-
 * level under cacheComponents (forcing the entire subtree out of the static
 * shell).
 */
import type { ReactNode } from "react";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
