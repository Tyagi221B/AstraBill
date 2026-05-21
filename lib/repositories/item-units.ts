/**
 * item_units repository — read-only for V1. The 41 system units are seeded
 * by migration 0006 and never mutate. Workspace-level custom units (V1.5)
 * will land here when the UI exposes them; the schema already supports
 * `business_id` on item_units.
 */
import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";

import { db } from "../db";
import { type ItemUnit, businessMembers, itemUnits } from "../db/schema";

/**
 * System units (visible to everyone) + the user's workspace custom units
 * (V1.5). For V1 with no custom units, this is just the 41 system rows.
 *
 * Caller must be an active member of the business — empty list returned
 * otherwise (no existence leak).
 */
export async function listUnitsForUser(opts: {
  userId: string;
  businessId: string;
}): Promise<ItemUnit[]> {
  const [member] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, opts.businessId),
        eq(businessMembers.userId, opts.userId),
        isNull(businessMembers.deletedAt),
      ),
    );
  if (!member) return [];

  return db
    .select()
    .from(itemUnits)
    .where(
      or(eq(itemUnits.isSystem, true), eq(itemUnits.businessId, opts.businessId)),
    )
    .orderBy(asc(itemUnits.displayName));
}
