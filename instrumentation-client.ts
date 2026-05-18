/**
 * PostHog client-side init.
 *
 * Next.js 15.3+ runs this file on the client before the app boots — the
 * documented place to initialise PostHog. We deliberately do NOT also mount
 * a PostHogProvider; the two approaches must not be combined (per
 * https://posthog.com/docs/libraries/next-js).
 *
 * `api_host: "/ingest"` routes events through a same-origin reverse proxy
 * (see `next.config.ts` rewrites) so they aren't intercepted by tracking
 * blockers. `defaults: "2026-01-30"` opts into PostHog's modern preset —
 * which includes History-API pageview and pageleave autocapture, so the
 * App Router doesn't need a separate route-change listener.
 *
 * Identify happens in `app/PostHogIdentify.tsx` (mounted from the root
 * layout); reset on logout in `app/SignOutButton.tsx`.
 */
import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  defaults: "2026-01-30",
  capture_exceptions: true,
  debug: process.env.NODE_ENV === "development",
});
