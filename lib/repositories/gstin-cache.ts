/**
 * gstin_cache repository — cross-tenant cache for GSTIN profile lookups.
 *
 * The cache is shared across businesses on purpose (the data is public —
 * see migration 0009 comment). The read path enforces tenant scoping at
 * the API boundary via requireUser; this repo is plain CRUD over a
 * single table.
 *
 * Rows past `cache_expires_at` are not auto-deleted — the service can
 * decide to serve a stale hit on vendor outage. A periodic cleanup job
 * (V1.5) may prune ancient rows; until then the row count is bounded by
 * the number of distinct GSTINs ever looked up by any tenant, which is
 * a small number compared to the parties table.
 */
import "server-only";
import { eq } from "drizzle-orm";

import { db } from "../db";
import {
  type GstinCacheRow,
  type NewGstinCacheRow,
  gstinCache,
} from "../db/schema";

export async function findGstinCacheRow(
  gstin: string,
): Promise<GstinCacheRow | null> {
  const [row] = await db
    .select()
    .from(gstinCache)
    .where(eq(gstinCache.gstin, gstin))
    .limit(1);
  return row ?? null;
}

/**
 * Upsert a cache row — overwrites on conflict (the latest vendor response
 * wins). The PK is `gstin`, so two concurrent fetches for the same GSTIN
 * each succeed; whichever commits last is the visible row.
 */
export async function upsertGstinCacheRow(
  values: NewGstinCacheRow,
): Promise<GstinCacheRow> {
  const [row] = await db
    .insert(gstinCache)
    .values(values)
    .onConflictDoUpdate({
      target: gstinCache.gstin,
      set: {
        legalName: values.legalName ?? null,
        tradeName: values.tradeName ?? null,
        streetAddress: values.streetAddress ?? null,
        city: values.city ?? null,
        state: values.state ?? null,
        stateCode: values.stateCode ?? null,
        pincode: values.pincode ?? null,
        status: values.status ?? null,
        registrationDate: values.registrationDate ?? null,
        businessType: values.businessType ?? null,
        rawResponse: values.rawResponse ?? null,
        vendor: values.vendor,
        fetchedAt: values.fetchedAt ?? new Date(),
        cacheExpiresAt: values.cacheExpiresAt,
      },
    })
    .returning();
  if (!row) throw new Error("Upsert gstin_cache returned no row");
  return row;
}
