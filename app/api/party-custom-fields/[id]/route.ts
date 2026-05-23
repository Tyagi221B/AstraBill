/**
 * PATCH  /api/party-custom-fields/[id] — rename / reorder.
 * DELETE /api/party-custom-fields/[id] — soft-delete; existing values
 *                                        remain in the DB for audit.
 */
import { ok, parseJson, route } from "@/lib/http";
import { updatePartyCustomFieldDefSchema } from "@/lib/schemas/party-custom-field";
import {
  deletePartyCustomFieldDef,
  updatePartyCustomFieldDef,
} from "@/lib/services/party-custom-fields";
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
    const input = await parseJson(req, updatePartyCustomFieldDefSchema);
    const updated = await updatePartyCustomFieldDef(
      id,
      input,
      user.id,
      audit(req),
    );
    return ok(updated);
  },
);

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deletePartyCustomFieldDef(id, user.id, audit(req));
    return ok({ deleted: true });
  },
);
