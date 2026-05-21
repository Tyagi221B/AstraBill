/**
 * POST /api/items — create an item.
 * GET  /api/items — list items (optionally one business + type filter).
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createItemSchema,
  listItemsQuerySchema,
} from "@/lib/schemas/item";
import { createItem, listItemsForUser } from "@/lib/services/items";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createItemSchema);
  const item = await createItem(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(item, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listItemsQuerySchema);
  const items = await listItemsForUser({
    userId: user.id,
    businessId: query.businessId,
    type: query.type,
    limit: query.limit,
  });
  return ok({ items });
});
