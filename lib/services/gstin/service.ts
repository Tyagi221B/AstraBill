/**
 * GSTIN lookup service — cache-first, adapter on miss/expiry.
 *
 * Flow:
 *   1. Normalise input (uppercase, format check)
 *   2. Read gstin_cache
 *   3. If hit + not expired + vendor matches current adapter → return cached
 *   4. Else call adapter; on success, upsert + return
 *   5. On adapter unavailable + stale cache exists → return stale + mark
 *      `stale: true` in the response so the UI can display a hint
 *
 * TTL: 30 days for the real Sandbox vendor; 1 hour for mock adapter
 * (mock rows shouldn't masquerade as fresh prod data if env vars get
 * configured later).
 *
 * Auth: this service is invoked from a route that calls requireUser. The
 * cache is cross-tenant; there is no business-membership check — the
 * data is public, the cost is bounded by login-gated rate.
 */
import "server-only";

import { getGstinAdapter } from "./factory";
import {
  GstinAdapterUnavailableError,
  type GstinProfile,
  normaliseGstin,
} from "./types";
import {
  findGstinCacheRow,
  upsertGstinCacheRow,
} from "../../repositories/gstin-cache";

const TTL_MS_BY_VENDOR: Record<string, number> = {
  sandbox: 30 * 24 * 60 * 60 * 1000, // 30 days
  setu: 30 * 24 * 60 * 60 * 1000,
  mock: 60 * 60 * 1000, // 1h — dev only
};

function ttlForVendor(vendor: string): number {
  return TTL_MS_BY_VENDOR[vendor] ?? 24 * 60 * 60 * 1000; // default 1d
}

export interface GstinLookupResult {
  profile: GstinProfile;
  /** Cache origin — useful for telemetry + the UI "fetched X ago" line. */
  source: "cache" | "vendor" | "stale-cache";
  /** Adapter that owns this profile (sandbox / setu / mock). */
  vendor: string;
  fetchedAt: string;
}

export async function lookupGstin(input: string): Promise<GstinLookupResult> {
  const gstin = normaliseGstin(input);
  const adapter = getGstinAdapter();

  const cached = await findGstinCacheRow(gstin);
  const now = Date.now();
  const isFresh =
    cached !== null &&
    cached.vendor === adapter.name &&
    cached.cacheExpiresAt.getTime() > now;

  if (cached && isFresh) {
    return {
      profile: rowToProfile(cached),
      source: "cache",
      vendor: cached.vendor,
      fetchedAt: cached.fetchedAt.toISOString(),
    };
  }

  try {
    const profile = await adapter.fetch(gstin);
    const ttl = ttlForVendor(adapter.name);
    const row = await upsertGstinCacheRow({
      gstin: profile.gstin,
      legalName: profile.legalName,
      tradeName: profile.tradeName,
      streetAddress: profile.address.streetAddress,
      city: profile.address.city,
      state: profile.address.state,
      stateCode: profile.address.stateCode,
      pincode: profile.address.pincode,
      status: profile.status,
      registrationDate: profile.registrationDate,
      businessType: profile.businessType,
      rawResponse: null, // we don't snapshot the raw payload in V1 (PII-lite)
      vendor: adapter.name,
      fetchedAt: new Date(),
      cacheExpiresAt: new Date(now + ttl),
    });
    return {
      profile: rowToProfile(row),
      source: "vendor",
      vendor: row.vendor,
      fetchedAt: row.fetchedAt.toISOString(),
    };
  } catch (err) {
    if (err instanceof GstinAdapterUnavailableError && cached) {
      // Stale-cache fallback. The UI shows a yellow hint; the profile is
      // still usable and beats refusing the form auto-fill.
      return {
        profile: rowToProfile(cached),
        source: "stale-cache",
        vendor: cached.vendor,
        fetchedAt: cached.fetchedAt.toISOString(),
      };
    }
    throw err;
  }
}

function rowToProfile(row: {
  gstin: string;
  legalName: string | null;
  tradeName: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  status: string | null;
  registrationDate: string | null;
  businessType: string | null;
}): GstinProfile {
  return {
    gstin: row.gstin,
    legalName: row.legalName,
    tradeName: row.tradeName,
    address: {
      streetAddress: row.streetAddress,
      city: row.city,
      state: row.state,
      stateCode: row.stateCode,
      pincode: row.pincode,
    },
    status: row.status,
    registrationDate: row.registrationDate,
    businessType: row.businessType,
  };
}
