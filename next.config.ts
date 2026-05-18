import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drizzle's `postgres` driver is server-only — keep it out of the client bundle.
  serverExternalPackages: ["postgres"],

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
