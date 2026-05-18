/**
 * GET    /api/customers/[id]  — fetch one customer (membership-scoped).
 * PATCH  /api/customers/[id]  — update (any subset of fields).
 * DELETE /api/customers/[id]  — soft-delete.
 *
 * All return 404 for "doesn't exist OR not a member" — no existence leak.
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { updateCustomerSchema } from "@/lib/schemas/customer";
import {
  deleteCustomer,
  getCustomer,
  updateCustomer,
} from "@/lib/services/customers";
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
    const customer = await getCustomer(id, user.id);
    if (!customer) throw new NotFoundError("Customer not found");
    return ok(customer);
  },
);

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updateCustomerSchema);
    const updated = await updateCustomer(id, input, user.id, audit(req));
    return ok(updated);
  },
);

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteCustomer(id, user.id, audit(req));
    return ok({ deleted: true });
  },
);
