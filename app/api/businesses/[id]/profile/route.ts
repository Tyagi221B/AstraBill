/**
 * PATCH /api/businesses/[id]/profile — update the Manage Business form
 * fields (name, GSTIN/PAN, address, business type / industry / registration,
 * signature, additional invoice details, FY start, TDS/TCS toggles).
 *
 * Owner-only at the service layer (`settings:edit`). 404 for "doesn't exist
 * OR not a member" — no existence leak.
 */
import { ok, parseJson, route } from "@/lib/http";
import { updateBusinessProfileSchema } from "@/lib/schemas/business";
import { updateBusinessProfile } from "@/lib/services/businesses";
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
    const input = await parseJson(req, updateBusinessProfileSchema);
    const updated = await updateBusinessProfile(id, input, user.id, audit(req));
    return ok(updated);
  },
);
