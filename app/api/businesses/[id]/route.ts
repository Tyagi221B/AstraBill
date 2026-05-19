/**
 * PATCH /api/businesses/[id] — update a business's invoice branding
 * (colour / font / template / column settings).
 *
 * Owner-only at the service layer (`settings:edit`). Returns 404 for
 * "doesn't exist OR not a member" — no existence leak.
 */
import { ok, parseJson, route } from "@/lib/http";
import { updateBrandingSchema } from "@/lib/schemas/business";
import { updateBusinessBranding } from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";

function audit(req: Request) {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updateBrandingSchema);
    const updated = await updateBusinessBranding(id, input, user.id, audit(req));
    return ok(updated);
  },
);
