/**
 * Users service — updates the caller's own profile.
 *
 * Editable fields (V1):
 *   - `name`           — display name
 *   - `imageOverride`  — user-uploaded avatar. Validated to be a URL on our
 *                        Cloudinary cloud (defence in depth alongside the
 *                        signed-upload pipeline). Pass `null` to clear and
 *                        revert to the OAuth picture.
 *
 * Audit entry captures only the keys actually patched so a name-only edit
 * doesn't leak an empty `imageOverride: null` into the audit trail.
 */
import "server-only";

import { db } from "../db";
import { writeAuditEntry } from "../audit";
import { isOurCloudinaryUrl } from "../cloudinary";
import type { User } from "../db/schema";
import { NotFoundError, ValidationError } from "../errors";
import { getUserById, updateUserTx, type UserPatch } from "../repositories/users";
import type { UpdateUserProfileInput } from "../schemas/user";

export interface ServiceContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function updateUserProfile(
  userId: string,
  input: UpdateUserProfileInput,
  ctx: ServiceContext = {},
): Promise<User> {
  return db.transaction(async (tx) => {
    const existing = await getUserById(userId);
    if (!existing) throw new NotFoundError("User not found");

    const patch: UserPatch = {};
    const changes: Record<string, unknown> = {};

    if (input.name !== undefined) {
      patch.name = input.name;
      changes.name = input.name;
    }
    if (input.imageOverride !== undefined) {
      if (input.imageOverride !== null && !isOurCloudinaryUrl(input.imageOverride)) {
        throw new ValidationError("Avatar URL must point at our Cloudinary cloud");
      }
      patch.imageOverride = input.imageOverride;
      changes.imageOverride = input.imageOverride;
    }

    // No-op PATCH — return existing row without writing an audit entry.
    if (Object.keys(patch).length === 0) return existing;

    const updated = await updateUserTx(tx, userId, patch);

    await writeAuditEntry(tx, {
      action: "user.update",
      businessId: null,
      actorUserId: userId,
      entityType: "user",
      entityId: userId,
      changes,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}
