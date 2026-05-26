/**
 * Server-side session helpers — the bridge between NextAuth and our services.
 *
 * Service-layer code never imports `auth()` directly; it calls these helpers
 * so the typed `UnauthorizedError` / `ForbiddenError` flows through the
 * standard route error pipeline (see lib/http.ts).
 *
 * What flows from NextAuth vs from our DB
 * ---------------------------------------
 * The JWT carries `userId` only — that's the load-bearing claim, the one
 * that identifies the caller. Everything else display-related (name, the
 * avatar URL) is fetched from `users` on every authed request. That makes
 * the DB the authoritative source for display fields — when the owner
 * saves their profile, the next render (after `refresh()`) reads the new
 * values without any JWT cookie-rewriting dance.
 *
 * The `image` field returned here is the resolved avatar:
 *   imageOverride ?? image
 * — i.e. user-uploaded photo if set, otherwise the OAuth provider's
 * picture. Every UserMenu (Sidebar, SettingsRail) just reads `user.image`
 * and gets the right thing.
 *
 * Cost: +1 DB query per authed request. The business layout already does
 * 2-3 queries; this is noise on top of that. PK lookups on `users` are
 * sub-millisecond on Postgres.
 */
import "server-only";
import { auth } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./errors";
import type { BusinessMember } from "./db/schema";
import { getMembership } from "./rbac";
import { getUserById } from "./repositories/users";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  /** Resolved display avatar — imageOverride if set, else OAuth picture. */
  image?: string | null;
}

/** The current user, or `null` if no valid session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const row = await getUserById(session.user.id);
  // Soft-deleted or hard-missing → treat as unauthenticated. The session
  // still has an id but the row is gone, so we can't render a real user.
  if (!row) return null;
  return {
    id: row.id,
    name: row.name ?? session.user.name ?? null,
    email: row.email ?? session.user.email ?? null,
    image: row.imageOverride ?? row.image ?? session.user.image ?? null,
  };
}

/** Required for any authenticated endpoint. Throws 401 if unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Required for any business-scoped endpoint. Verifies the user is an active
 * member of the business (the V1 tenant-isolation guard). Returns both the
 * user and their membership so callers can branch on role without a re-query.
 */
export async function requireMember(
  businessId: string,
): Promise<{ user: SessionUser; membership: BusinessMember }> {
  const user = await requireUser();
  const membership = await getMembership(user.id, businessId);
  if (!membership) {
    throw new ForbiddenError("You are not a member of this business");
  }
  return { user, membership };
}
