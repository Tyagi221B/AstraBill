/**
 * Business service — owner-bootstrap on create.
 *
 * Lifecycle of one create call (all inside one transaction):
 *   1. Insert the `businesses` row.
 *   2. Insert a `business_members` row tying the caller to it as `owner`.
 *   3. Write a `business.create` audit-log entry.
 *
 * If any step fails, all three roll back together — the user never ends up
 * with a business they can't access (or a membership without a business).
 */
import "server-only";

import { db } from "../db";
import { writeAuditEntry } from "../audit";
import type { Business, BusinessMember } from "../db/schema";
import type { CreateBusinessInput } from "../schemas/business";
import {
  insertBusiness,
  insertMember,
  listBusinessesForUser,
} from "../repositories/businesses";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreatedBusiness {
  business: Business;
  membership: BusinessMember;
}

export async function createBusiness(
  input: CreateBusinessInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<CreatedBusiness> {
  return db.transaction(async (tx) => {
    const business = await insertBusiness(tx, {
      name: input.name,
      stateCode: input.stateCode ?? null,
      gstin: input.gstin ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
    });

    const membership = await insertMember(tx, {
      businessId: business.id,
      userId: actorUserId,
      role: "owner",
    });

    await writeAuditEntry(tx, {
      action: "business.create",
      businessId: business.id,
      actorUserId,
      entityType: "business",
      entityId: business.id,
      changes: {
        name: business.name,
        stateCode: business.stateCode,
        hasGstin: business.gstin !== null,
      },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { business, membership };
  });
}

export { listBusinessesForUser };
