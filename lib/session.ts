/**
 * Server-side session helpers — the bridge between NextAuth and our services.
 *
 * Service-layer code never imports `auth()` directly; it calls these helpers
 * so the typed `UnauthorizedError` / `ForbiddenError` flows through the
 * standard route error pipeline (see lib/http.ts).
 */
import "server-only";

import { auth } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./errors";
import type { BusinessMember } from "./db/schema";
import { getMembership } from "./rbac";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/** The current user, or `null` if no valid session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
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
