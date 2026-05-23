/**
 * Adapter factory — picks the GSTIN lookup vendor for the current process.
 *
 * Pick order:
 *   1. SANDBOX_API_KEY + SANDBOX_API_SECRET → SandboxGstinAdapter
 *   2. (future) SETU_CLIENT_ID + SETU_CLIENT_SECRET → SetuGstinAdapter
 *   3. NODE_ENV !== "production" → MockGstinAdapter (dev convenience only)
 *   4. nothing — `isGstinLookupAvailable()` returns false; the UI hides the
 *      "Get details" button, and the route returns 503
 *
 * The picked adapter is singleton-cached per process. Hot-reloads in dev
 * re-evaluate.
 *
 * Important: the mock is dev-only. We used to fall back to it in prod when
 * env vars were missing — that auto-filled real parties with fake names.
 * Now prod without keys is a "feature off" state, never silent-fake-data.
 */
import "server-only";

import { MockGstinAdapter } from "./mock-adapter";
import { SandboxGstinAdapter } from "./sandbox-adapter";
import type { GstinLookupAdapter } from "./types";

let cached: GstinLookupAdapter | null | undefined;

function pickAdapter(): GstinLookupAdapter | null {
  const sandboxKey = process.env.SANDBOX_API_KEY?.trim();
  const sandboxSecret = process.env.SANDBOX_API_SECRET?.trim();
  if (sandboxKey && sandboxSecret) {
    return new SandboxGstinAdapter({
      apiKey: sandboxKey,
      apiSecret: sandboxSecret,
    });
  }
  if (process.env.NODE_ENV !== "production") {
    return new MockGstinAdapter();
  }
  return null;
}

/** Returns the adapter or throws GstinAdapterUnavailableError if none. */
export function getGstinAdapter(): GstinLookupAdapter | null {
  if (cached !== undefined) return cached;
  cached = pickAdapter();
  return cached;
}

/**
 * Server-side feature flag. Server components call this and pass the
 * boolean down to the PartyForm so the "Get details" button only renders
 * when a lookup is actually wired up. Same source of truth as the route
 * — UI and API can never disagree.
 */
export function isGstinLookupAvailable(): boolean {
  return getGstinAdapter() !== null;
}

/** Test seam — drop the cached instance so a new adapter is picked. */
export function resetGstinAdapter(): void {
  cached = undefined;
}
