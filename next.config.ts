import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Drizzle's `postgres` driver is server-only — keep it out of the client bundle.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
