/**
 * Role-based access control — the single source of truth for permissions.
 *
 * Why TypeScript and not SQL: business rules change daily in an early
 * product; debugging a SQL policy at 2am is misery; unit-testing one is
 * harder. See wiki/decision/database-and-rbac.md.
 *
 * Add a permission → add it to PERMISSIONS, then call `requirePermission` at
 * the service-layer entry point. Never branch on `role` directly in route or
 * service code; always go through a permission string.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "./db";
import { businessMembers } from "./db/schema";
import type { Role } from "./db/schema";
import { ForbiddenError } from "./errors";

// ---- Permission catalog -------------------------------------------------
// Owner is the superset; every other role is a subset of owner's permissions.

const ALL_PERMISSIONS = [
  // Payments (Payment In / Payment Out — entries on payment_entries)
  "payment:record",
  "payment:delete",
  // Parties (customers + suppliers in one table)
  "party:view",
  "party:create",
  "party:edit",
  "party:delete",
  // Items (products + services)
  "item:view",
  "item:create",
  "item:edit",
  "item:delete",
  "item_category:manage",
  "stock:adjust",
  // Money accounts (Cash & Bank)
  "money_account:view",
  "money_account:manage", // create + edit + soft-delete
  "money_account:adjust", // Add / Reduce money (manual_adjustment ledger row)
  "money_account:transfer", // Transfer money (paired transfer_in/out rows)
  // Documents (all 8 doc types share this permission ladder)
  "document:view",
  "document:create", // create + update drafts
  "document:finalize", // draft → unpaid (locks number + ledger + stock)
  "document:cancel", // finalised → cancelled (writes reversal entries)
  "document:delete", // hard-delete a draft (finalised use cancel)
  // WhatsApp
  "whatsapp:send",
  // Reports
  "report:view_profit", // gates purchase price / margin visibility
  "report:gst",
  // Business / users
  "user:invite",
  "user:remove",
  "settings:edit",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: ALL_PERMISSIONS,

  admin: [
    "payment:record",
    "payment:delete",
    "party:view",
    "party:create",
    "party:edit",
    "party:delete",
    "item:view",
    "item:create",
    "item:edit",
    "item:delete",
    "item_category:manage",
    "stock:adjust",
    "money_account:view",
    "money_account:manage",
    "money_account:adjust",
    "money_account:transfer",
    "document:view",
    "document:create",
    "document:finalize",
    "document:cancel",
    "document:delete",
    "whatsapp:send",
    "report:view_profit",
    "report:gst",
    "user:invite",
    "user:remove",
  ],

  accountant: [
    "payment:record",
    "party:view",
    "party:create",
    "party:edit",
    "item:view",
    "item_category:manage",
    "money_account:view",
    "money_account:adjust",
    "money_account:transfer",
    "document:view",
    "document:create",
    "document:finalize",
    "whatsapp:send",
    "report:view_profit",
    "report:gst",
  ],

  // Critical invariant: salesman has NO profit visibility. Even though they
  // can view items to bill, the service layer strips purchase_price from
  // responses for roles that lack `report:view_profit`. See `redactForRole`.
  salesman: [
    "party:view",
    "party:create",
    "item:view",
    "document:view",
    "document:create",
    "whatsapp:send",
  ],

  viewer: [
    "party:view",
    "item:view",
    "money_account:view",
    "document:view",
  ],
} as const;

// ---- Pure helpers (no DB) ----------------------------------------------

export function roleHas(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[role] as readonly Permission[]).includes(permission);
}

/**
 * Strips fields a role isn't allowed to see — call at the serialization edge.
 * Currently: hide purchase price / margin from anyone without
 * `report:view_profit`. Keep this list narrow and explicit.
 */
export function redactForRole<T extends { purchasePrice?: unknown }>(
  row: T,
  role: Role,
): T {
  if (roleHas(role, "report:view_profit")) return row;
  const { purchasePrice: _drop, ...rest } = row;
  return rest as T;
}

// ---- DB-backed checks ---------------------------------------------------

/** Active (non-soft-deleted) membership of `userId` in `businessId`, if any. */
export async function getMembership(userId: string, businessId: string) {
  return db.query.businessMembers.findFirst({
    where: and(
      eq(businessMembers.userId, userId),
      eq(businessMembers.businessId, businessId),
      isNull(businessMembers.deletedAt),
    ),
  });
}

/**
 * Service-layer guard. Throws `ForbiddenError` if the user is not an active
 * member of the business or their role lacks the permission. Returns the
 * resolved role so callers can branch / redact without a second query.
 */
export async function requirePermission(
  userId: string,
  businessId: string,
  permission: Permission,
): Promise<Role> {
  const member = await getMembership(userId, businessId);
  if (!member) throw new ForbiddenError("You are not a member of this business");
  const role = member.role as Role;
  if (!roleHas(role, permission)) {
    throw new ForbiddenError(
      `Your role (${role}) cannot perform "${permission}"`,
    );
  }
  return role;
}
