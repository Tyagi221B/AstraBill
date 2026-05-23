/**
 * Adapter factory — picks the GSTIN lookup vendor for the current process.
 *
 * Pick order:
 *   1. SANDBOX_API_KEY + SANDBOX_API_SECRET → SandboxGstinAdapter
 *   2. (future) SETU_CLIENT_ID + SETU_CLIENT_SECRET → SetuGstinAdapter
 *   3. fallback → MockGstinAdapter (dev only — never set in prod env)
 *
 * The picked adapter is singleton-cached per process. Hot-reloads in dev
 * re-evaluate.
 */
import "server-only";

import { MockGstinAdapter } from "./mock-adapter";
import { SandboxGstinAdapter } from "./sandbox-adapter";
import type { GstinLookupAdapter } from "./types";

let cached: GstinLookupAdapter | null = null;

export function getGstinAdapter(): GstinLookupAdapter {
  if (cached) return cached;

  const sandboxKey = process.env.SANDBOX_API_KEY?.trim();
  const sandboxSecret = process.env.SANDBOX_API_SECRET?.trim();
  if (sandboxKey && sandboxSecret) {
    cached = new SandboxGstinAdapter({
      apiKey: sandboxKey,
      apiSecret: sandboxSecret,
    });
    return cached;
  }

  // No vendor configured — fall back to mock. Production deploys should
  // always have SANDBOX_API_KEY set; if you see "vendor: mock" in the
  // cache table on prod, the env var is missing.
  cached = new MockGstinAdapter();
  return cached;
}

/** Test seam — drop the cached instance so a new adapter is picked. */
export function resetGstinAdapter(): void {
  cached = null;
}
