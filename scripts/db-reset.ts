/**
 * CLI — wipe USER data, preserve system tables, re-seed.
 *
 * Usage:
 *   npm run db:reset -- --yes
 *
 * The `--yes` flag is mandatory — there is no interactive prompt because
 * CLI agents and CI never read stdin reliably, and a silent destructive
 * default would be the worst kind of footgun. Run without `--yes` to see
 * exactly which tables would be truncated, against which DB host, with no
 * side effects.
 *
 * What it does:
 *   1. Enumerate every public-schema table.
 *   2. TRUNCATE each one in dependency order (RESTART IDENTITY CASCADE),
 *      EXCEPT the denylist below (drizzle's migrations log + every system
 *      reference table — see lib/db/seed/index.ts for the rule).
 *   3. Re-run seedSystem() — belt-and-braces in case anyone ever truncates
 *      a system table by accident, the seed self-heals on the next reset.
 *
 * Single Supabase project caveat: per DECISIONS.md, dev/preprod/prod all
 * share ONE database in V1. This command will wipe whichever DB
 * DATABASE_URL points at — there is no environment heuristic to fall back
 * on, hence the explicit `--yes`. Splits before GA.
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });
config({ path: ".env" });

import { seedSystem } from "@/lib/db/seed";
import { makeCliDb } from "./db-client";

/**
 * Tables that survive `db:reset`. Anything not in this list is user data
 * and gets truncated. Keep this list in lockstep with lib/db/seed/.
 */
const PRESERVED_TABLES = new Set<string>([
  "__drizzle_migrations", // drizzle's own bookkeeping
  "item_units", // system UQC reference — seeded by lib/db/seed/system-units.ts
]);

function dbHost(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "<DATABASE_URL not set>";
  try {
    return new URL(url).host;
  } catch {
    return "<unparseable>";
  }
}

async function main() {
  const flag = process.argv.includes("--yes");
  const { db, close } = makeCliDb();

  try {
    const rows = await db.execute<{ tablename: string }>(sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const allTables = Array.from(rows).map((r) => r.tablename);
    const toTruncate = allTables.filter((t) => !PRESERVED_TABLES.has(t));
    const toPreserve = allTables.filter((t) => PRESERVED_TABLES.has(t));

    console.log(`db:reset — target host: ${dbHost()}`);
    console.log(`  preserve (${toPreserve.length}): ${toPreserve.join(", ")}`);
    console.log(`  truncate (${toTruncate.length}): ${toTruncate.join(", ")}`);

    if (!flag) {
      console.log("\nDry run — pass `--yes` to actually wipe.");
      return;
    }

    if (toTruncate.length === 0) {
      console.log("\nNothing to truncate (preserve list covers every table?).");
    } else {
      // One TRUNCATE statement, comma-separated, so the CASCADE happens
      // atomically across all FK-related tables.
      const tableList = toTruncate.map((t) => `"${t}"`).join(", ");
      await db.execute(
        sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`),
      );
      console.log(`\n✓ truncated ${toTruncate.length} table(s)`);
    }

    const report = await seedSystem(db);
    console.log(
      `✓ seedSystem re-applied (item_units: ${report.units.inserted} inserted)`,
    );
  } finally {
    await close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ reset failed:", err);
    process.exit(1);
  });
