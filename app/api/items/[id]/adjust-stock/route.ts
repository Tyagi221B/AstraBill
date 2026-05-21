/**
 * POST /api/items/[id]/adjust-stock — manual stock adjustment.
 *
 * Writes a single `manual_adjustment` movement under a FOR UPDATE lock on
 * the item row, so concurrent adjustments can't race past each other's
 * closing_stock_after snapshot.
 */
import { ok, parseJson, route } from "@/lib/http";
import { adjustStockSchema } from "@/lib/schemas/item-stock";
import { adjustItemStock } from "@/lib/services/items";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, adjustStockSchema);
    const result = await adjustItemStock(id, input, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return ok(result);
  },
);
