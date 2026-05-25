/**
 * PATCH /api/users/me — update the caller's own account profile.
 *
 * Auth: the caller's own user id is the only id this route mutates — no
 * `id` param, no admin path. V1 surface is just `name`.
 */
import { ok, parseJson, route } from "@/lib/http";
import { updateUserProfileSchema } from "@/lib/schemas/user";
import { updateUserProfile } from "@/lib/services/users";
import { requireUser } from "@/lib/session";

function audit(req: Request) {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, updateUserProfileSchema);
  const updated = await updateUserProfile(user.id, input, audit(req));
  return ok(updated);
});
