/**
 * GET    /api/items/[id]  — fetch one item (membership-scoped).
 * PATCH  /api/items/[id]  — update.
 * DELETE /api/items/[id]  — soft-delete.
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { updateItemSchema } from "@/lib/schemas/item";
import { deleteItem, getItem, updateItem } from "@/lib/services/items";
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
    const item = await getItem(id, user.id);
    if (!item) throw new NotFoundError("Item not found");
    return ok(item);
  },
);

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updateItemSchema);
    const updated = await updateItem(id, input, user.id, audit(req));
    return ok(updated);
  },
);

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteItem(id, user.id, audit(req));
    return ok({ deleted: true });
  },
);
