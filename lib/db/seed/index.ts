/**
 * System seed — the runtime source of truth for reference data that lives
 * in the DB but is *managed by the platform*, not by users.
 *
 * Rule of thumb (also recorded in DECISIONS.md):
 *   - User data (parties, items, documents, payments…) is born from the
 *     app and dies with `db:reset`. The reset script truncates everything
 *     that isn't on the system-table denylist.
 *   - Per-business seed data (default Cash money_account, "Cash Sale"
 *     party, doc_type_defaults) is born at business creation in
 *     `lib/services/businesses.ts` — NOT here. It self-heals because every
 *     fresh signup re-creates it.
 *   - System reference data (UQC units today; states/currencies/GST rate
 *     catalogue tomorrow) is owned by THIS module. Adding a new system
 *     seed = add a new file here, register it below, run `db:seed`. No
 *     new migration unless the *schema* changes.
 *
 * `seedSystem()` runs every registered seeder in order. Each seeder is
 * idempotent (UPSERT or `ON CONFLICT DO NOTHING`); running this on a fully
 * populated DB is a no-op.
 */
import { type DbLike, seedSystemUnits } from "./system-units";

export interface SeedReport {
  units: { inserted: number; total: number };
}

export async function seedSystem(db: DbLike): Promise<SeedReport> {
  const units = await seedSystemUnits(db);
  return { units };
}

export {
  SYSTEM_UNITS,
  seedSystemUnits,
  countSystemUnits,
  type DbLike,
} from "./system-units";
