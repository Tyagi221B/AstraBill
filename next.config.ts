import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drizzle's `postgres` driver is server-only — keep it out of the client bundle.
  serverExternalPackages: ["postgres"],

  // Cache Components — Phase 2.2 of the performance roadmap.
  // Enables Partial Prerendering: layouts ship as a static shell + dynamic
  // content streams in via Suspense. Forces explicit Suspense boundaries
  // around uncached dynamic data (cookies/headers/DB queries) so we never
  // ship a blank-flash page. See wiki/decision/performance-roadmap.md.
  cacheComponents: true,

  // PostHog reverse proxy. Routing client-side events through a same-origin
  // path (`/ingest/*`) sidesteps tracking blockers that would intercept
  // requests to `*.posthog.com` directly. The three rewrites cover the three
  // PostHog asset / API hosts; the order matters (most-specific first).
  // Mirrors PostHog's Next.js App Router reference.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // PostHog's ingestion endpoints expect their trailing slashes preserved.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
