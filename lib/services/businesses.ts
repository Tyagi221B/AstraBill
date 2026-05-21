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
import { isOurCloudinaryUrl } from "../cloudinary";
import type { Business, BusinessMember } from "../db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { roleHas } from "../rbac";
import type {
  CreateBusinessInput,
  UpdateBrandingInput,
  UpdatePaymentSettingsInput,
} from "../schemas/business";
import {
  getBusinessForUserTx,
  insertBusiness,
  insertMember,
  listBusinessesForUser,
  updateBusinessRow,
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

/**
 * Update a business's invoice branding (colour / font / template / column
 * settings). Owner-only — `settings:edit` is owner's alone in the RBAC
 * catalogue. A non-member is treated as 404 (no existence leak); a member
 * whose role lacks the permission gets 403.
 */
export async function updateBusinessBranding(
  businessId: string,
  input: UpdateBrandingInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Business> {
  return db.transaction(async (tx) => {
    const found = await getBusinessForUserTx(tx, actorUserId, businessId);
    if (!found) throw new NotFoundError("Business not found");
    if (!roleHas(found.role, "settings:edit")) {
      throw new ForbiddenError(
        `Your role (${found.role}) cannot edit business settings`,
      );
    }

    // A non-null logo URL must point at our own Cloudinary cloud — otherwise
    // a crafted PATCH could aim the invoice renderer at an arbitrary host.
    if (
      typeof input.logoUrl === "string" &&
      !isOurCloudinaryUrl(input.logoUrl)
    ) {
      throw new ValidationError(
        "Logo URL must be an uploaded image on AstraBill's media host",
      );
    }

    // `input` is the Zod-validated patch — keys map 1:1 to business columns.
    const updated = await updateBusinessRow(tx, businessId, input);

    await writeAuditEntry(tx, {
      action: "business.update",
      businessId,
      actorUserId,
      entityType: "business",
      entityId: businessId,
      changes: input,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}

/**
 * Update a business's payment-collection settings — for V1, just the UPI
 * deep-link target (`upi_id`). Same auth model as branding: owner-only
 * (`settings:edit`), 404 for not-a-member (no existence leak).
 *
 * `input.upiId === null` clears the VPA; the share-page Pay button hides
 * itself when the VPA is null.
 */
export async function updateBusinessPaymentSettings(
  businessId: string,
  input: UpdatePaymentSettingsInput,
  actorUserId: string,
  ctx: ServiceContext = {},
): Promise<Business> {
  return db.transaction(async (tx) => {
    const found = await getBusinessForUserTx(tx, actorUserId, businessId);
    if (!found) throw new NotFoundError("Business not found");
    if (!roleHas(found.role, "settings:edit")) {
      throw new ForbiddenError(
        `Your role (${found.role}) cannot edit business settings`,
      );
    }

    const updated = await updateBusinessRow(tx, businessId, input);

    await writeAuditEntry(tx, {
      action: "business.update",
      businessId,
      actorUserId,
      entityType: "business",
      entityId: businessId,
      changes: input,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}

export { listBusinessesForUser };

/**
 * The user's "active by default" business — the most recently joined one. Used
 * by the smart `/dashboard` redirect and by any auto-enter flow. Returns null
 * when the user has no business yet (onboarding hasn't completed).
 *
 * V1 heuristic = most-recently-joined membership; the upgrade path (track
 * `lastBusinessId` on `users` for most-recently-used) is a follow-up.
 */
export async function getMostRecentBusinessForUser(
  userId: string,
) {
  const list = await listBusinessesForUser(userId);
  return list[0] ?? null;
}
