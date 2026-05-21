/**
 * POST /api/item-categories — create a category.
 * GET  /api/item-categories?businessId=… — list workspace categories.
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createItemCategorySchema,
  listItemCategoriesQuerySchema,
} from "@/lib/schemas/item-category";
import {
  createItemCategory,
  listItemCategoriesForUser,
} from "@/lib/services/item-categories";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createItemCategorySchema);
  const category = await createItemCategory(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(category, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listItemCategoriesQuerySchema);
  const categories = await listItemCategoriesForUser({
    userId: user.id,
    businessId: query.businessId,
  });
  return ok({ categories });
});
