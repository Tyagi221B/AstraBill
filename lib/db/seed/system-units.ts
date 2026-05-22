/**
 * System measuring units (UQC list) — the 41 Unit Quantity Codes that
 * govern GST e-invoicing. This array is the runtime source of truth for the
 * seed; migration 0006 carries an identical static copy for the initial
 * bootstrap, but every subsequent seed (re-seed after a wipe, adding a 42nd
 * unit, fresh test DB, etc.) goes through this module.
 *
 * Why TS, not a new migration:
 *   - Migrations are one-shot. Once 0006 is recorded in __drizzle_migrations,
 *     Drizzle never re-runs it — so a TRUNCATE leaves the table empty
 *     forever, even after `npm run db:migrate`.
 *   - This module is idempotent (`ON CONFLICT (code) DO NOTHING`), so
 *     `npm run db:seed` is safe to call any number of times.
 *   - Adding unit #42 means appending one row here + running db:seed; no new
 *     migration needed for reference data that doesn't change schema shape.
 *
 * Insertion ordering: alphabetical by code. The display order in the UI is
 * driven by `display_name ASC` in the repository, not by insertion order.
 */
import { eq, sql, type TablesRelationalConfig } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { itemUnits } from "@/lib/db/schema";

/**
 * Anything that quacks like a Drizzle PG client — accepts both the Next.js
 * runtime singleton (`@/lib/db`) and the CLI client (`scripts/db-client.ts`)
 * without dragging either's module-level imports (e.g. `server-only`) into
 * this seed module. Transactions satisfy the same shape.
 *
 * The schema generics are unconstrained because we don't care about the
 * caller's relational graph — this module only touches `item_units`
 * explicitly.
 */
export type DbLike = PgDatabase<
  PgQueryResultHKT,
  Record<string, unknown>,
  TablesRelationalConfig
>;

export interface SystemUnit {
  code: string;
  displayName: string;
}

export const SYSTEM_UNITS: readonly SystemUnit[] = [
  { code: "BAG", displayName: "Bags" },
  { code: "BAL", displayName: "Bale" },
  { code: "BDL", displayName: "Bundles" },
  { code: "BKL", displayName: "Buckles" },
  { code: "BOX", displayName: "Box" },
  { code: "BTL", displayName: "Bottles" },
  { code: "BUN", displayName: "Bunches" },
  { code: "CAN", displayName: "Cans" },
  { code: "CBM", displayName: "Cubic Meters" },
  { code: "CCM", displayName: "Cubic Centimeters" },
  { code: "CMS", displayName: "Centimeters" },
  { code: "CTN", displayName: "Cartons" },
  { code: "DOZ", displayName: "Dozens" },
  { code: "DRM", displayName: "Drums" },
  { code: "GMS", displayName: "Grams" },
  { code: "GRS", displayName: "Gross" },
  { code: "HKS", displayName: "Hanks" },
  { code: "KGS", displayName: "Kilograms" },
  { code: "KLR", displayName: "Kilolitre" },
  { code: "KME", displayName: "Kilometre" },
  { code: "LTR", displayName: "Litres" },
  { code: "MLT", displayName: "Millilitre" },
  { code: "MTR", displayName: "Meters" },
  { code: "MTS", displayName: "Metric Ton" },
  { code: "NOS", displayName: "Numbers" },
  { code: "OTH", displayName: "Others" },
  { code: "PAC", displayName: "Packs" },
  { code: "PCS", displayName: "Pieces" },
  { code: "PRS", displayName: "Pairs" },
  { code: "QTL", displayName: "Quintal" },
  { code: "ROL", displayName: "Rolls" },
  { code: "SET", displayName: "Sets" },
  { code: "SQF", displayName: "Square Feet" },
  { code: "SQM", displayName: "Square Meters" },
  { code: "SQY", displayName: "Square Yards" },
  { code: "TBS", displayName: "Tablets" },
  { code: "THD", displayName: "Thousands" },
  { code: "TON", displayName: "Tonnes" },
  { code: "TUB", displayName: "Tubes" },
  { code: "UNT", displayName: "Units" },
  { code: "YDS", displayName: "Yards" },
];

/**
 * Insert any missing system units. Existing rows are left untouched —
 * `display_name` edits to a system unit are deliberately NOT a concern of
 * this seeder (would need a separate `--force` upsert path, not built until
 * we actually need it).
 *
 * Pass a `Tx` if you're inside a transaction (e.g. test setup); otherwise
 * pass the top-level `db`.
 */
export async function seedSystemUnits(executor: DbLike): Promise<{
  inserted: number;
  total: number;
}> {
  const rows = SYSTEM_UNITS.map((u) => ({
    code: u.code,
    displayName: u.displayName,
    isSystem: true,
    businessId: null,
  }));

  const result = await executor
    .insert(itemUnits)
    .values(rows)
    .onConflictDoNothing({ target: itemUnits.code })
    .returning({ code: itemUnits.code });

  return { inserted: result.length, total: SYSTEM_UNITS.length };
}

/**
 * Count of system units currently in the DB — used by the CLI to print a
 * post-seed sanity line and by tests to assert the bootstrap state.
 */
export async function countSystemUnits(executor: DbLike): Promise<number> {
  const [row] = await executor
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(itemUnits)
    .where(eq(itemUnits.isSystem, true));
  return row ? Number(row.count) : 0;
}
