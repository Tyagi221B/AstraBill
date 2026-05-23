/**
 * POST /api/party-categories — create a category.
 * GET  /api/party-categories?businessId=… — list workspace categories.
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createPartyCategorySchema,
  listPartyCategoriesQuerySchema,
} from "@/lib/schemas/party-category";
import {
  createPartyCategory,
  listPartyCategoriesForUser,
} from "@/lib/services/party-categories";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createPartyCategorySchema);
  const category = await createPartyCategory(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(category, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listPartyCategoriesQuerySchema);
  const categories = await listPartyCategoriesForUser({
    userId: user.id,
    businessId: query.businessId,
  });
  return ok({ categories });
});
