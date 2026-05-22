/**
 * CLI — apply system seed to the configured database.
 *
 * Usage:
 *   npm run db:seed
 *
 * Idempotent: existing rows are skipped via `ON CONFLICT DO NOTHING`, so
 * running this repeatedly is safe. Use it after a `db:reset`, after adding
 * new entries to a system seed array, or when bringing up a fresh DB.
 *
 * Env: reads .env.local first (Next's gitignored local secrets), then .env
 * for CI. Mirrors what drizzle.config.ts does — keep these in sync.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { countSystemUnits, seedSystem } from "@/lib/db/seed";
import { makeCliDb } from "./db-client";

async function main() {
  const { db, close } = makeCliDb();
  try {
    const before = await countSystemUnits(db);
    const report = await seedSystem(db);
    const after = await countSystemUnits(db);

    console.log("✓ seedSystem applied");
    console.log(
      `  item_units: ${after} rows in DB (${report.units.inserted} inserted this run, ${before} pre-existing)`,
    );
  } finally {
    await close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ seed failed:", err);
    process.exit(1);
  });
