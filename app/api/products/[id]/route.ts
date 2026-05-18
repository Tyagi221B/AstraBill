/**
 * GET    /api/products/[id]  — fetch one product (purchasePrice redacted by role).
 * PATCH  /api/products/[id]  — update any subset of fields.
 * DELETE /api/products/[id]  — soft-delete.
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { updateProductSchema } from "@/lib/schemas/product";
import {
  deleteProduct,
  getProduct,
  updateProduct,
} from "@/lib/services/products";
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
    const product = await getProduct(id, user.id);
    if (!product) throw new NotFoundError("Product not found");
    return ok(product);
  },
);

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updateProductSchema);
    const updated = await updateProduct(id, input, user.id, audit(req));
    return ok(updated);
  },
);

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteProduct(id, user.id, audit(req));
    return ok({ deleted: true });
  },
);
