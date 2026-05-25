/**
 * Users service — V1 carries one operation: updating the caller's own
 * display name. The OAuth provider remains the source of truth for email +
 * image; we don't try to override either.
 */
import "server-only";

import { db } from "../db";
import { writeAuditEntry } from "../audit";
import type { User } from "../db/schema";
import { NotFoundError } from "../errors";
import { getUserById, updateUserTx } from "../repositories/users";
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

    const updated = await updateUserTx(tx, userId, { name: input.name });

    await writeAuditEntry(tx, {
      action: "user.update",
      businessId: null,
      actorUserId: userId,
      entityType: "user",
      entityId: userId,
      changes: { name: input.name },
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return updated;
  });
}
