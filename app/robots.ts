import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

// Crawl the marketing site; keep the authed app + API out of the index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        // Every business-scoped app page (Phase 2D).
        "/b/",
        // Public invoice views — share links, not for the index.
        "/i/",
        "/onboarding",
        "/sign-in",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
