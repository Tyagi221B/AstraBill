/**
 * GET    /api/parties/[id]  — fetch one party (membership-scoped).
 * PATCH  /api/parties/[id]  — update (any subset of fields).
 * DELETE /api/parties/[id]  — soft-delete (Cash Sale is structural, not deletable).
 *
 * All return 404 for "doesn't exist OR not a member" — no existence leak.
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { updatePartySchema } from "@/lib/schemas/party";
import {
  deleteParty,
  getParty,
  updateParty,
} from "@/lib/services/parties";
import { requireUser } from "@/lib/session";

function audit(req: Request) {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}

export const GET = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const party = await getParty(id, user.id);
    if (!party) throw new NotFoundError("Party not found");
    return ok(party);
  },
);

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updatePartySchema);
    const updated = await updateParty(id, input, user.id, audit(req));
    return ok(updated);
  },
);

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteParty(id, user.id, audit(req));
    return ok({ deleted: true });
  },
);
