/**
 * users repository — the auth-side of the user record. Most users data is
 * read straight from the session (set up by NextAuth); this repository
 * exists so the Account settings page can write back to it.
 *
 * Writes are intentionally narrow: we never touch `email`, `emailVerified`,
 * or `image` from this layer — those come from the OAuth provider on each
 * sign-in and would just be overwritten anyway.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";

import { db, type Tx } from "../db";
import { type User, users } from "../db/schema";

export async function getUserById(userId: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  return row ?? null;
}

export interface UserPatch {
  name?: string;
}

export async function updateUserTx(
  tx: Tx,
  userId: string,
  patch: UserPatch,
): Promise<User> {
  const [row] = await tx
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning();
  if (!row) throw new Error("Update users returned no row");
  return row;
}
