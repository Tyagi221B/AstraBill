/**
 * POST /api/products — create a product in the caller's business.
 * GET  /api/products — list products visible to the caller.
 *
 * `purchasePrice` is omitted from responses for roles without
 * `report:view_profit` — applied by the service layer.
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createProductSchema,
  listProductsQuerySchema,
} from "@/lib/schemas/product";
import {
  createProduct,
  listProductsForUser,
} from "@/lib/services/products";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createProductSchema);

  const product = await createProduct(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(product, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listProductsQuerySchema);
  const products = await listProductsForUser({
    userId: user.id,
    businessId: query.businessId,
    limit: query.limit,
  });
  return ok({ products });
});
