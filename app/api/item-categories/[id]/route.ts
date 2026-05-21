/**
 * DELETE /api/item-categories/[id] — soft-delete a category. Items already
 * tagged with this category keep their categoryId (it just becomes a dangling
 * reference; the UI shows "—" instead of the name).
 */
import { ok, route } from "@/lib/http";
import { deleteItemCategory } from "@/lib/services/item-categories";
import { requireUser } from "@/lib/session";

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteItemCategory(id, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return ok({ deleted: true });
  },
);
