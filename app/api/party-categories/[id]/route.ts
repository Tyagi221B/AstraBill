/**
 * PATCH  /api/party-categories/[id] — rename.
 * DELETE /api/party-categories/[id] — soft-delete. Parties already tagged
 *                                     with this category keep their FK; the
 *                                     UI shows "—" for a dangling reference.
 */
import { ok, parseJson, route } from "@/lib/http";
import { updatePartyCategorySchema } from "@/lib/schemas/party-category";
import {
  deletePartyCategory,
  updatePartyCategory,
} from "@/lib/services/party-categories";
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
    const input = await parseJson(req, updatePartyCategorySchema);
    const updated = await updatePartyCategory(id, input, user.id, audit(req));
    return ok(updated);
  },
);

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deletePartyCategory(id, user.id, audit(req));
    return ok({ deleted: true });
  },
);
