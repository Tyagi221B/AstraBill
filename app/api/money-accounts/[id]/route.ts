/**
 * GET    /api/money-accounts/[id] — fetch one (membership-scoped).
 * PATCH  /api/money-accounts/[id] — update metadata (name, bank fields, default).
 * DELETE /api/money-accounts/[id] — soft-delete (refused if balance ≠ 0).
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { updateMoneyAccountSchema } from "@/lib/schemas/money-account";
import {
  deleteMoneyAccount,
  getMoneyAccount,
  updateMoneyAccount,
} from "@/lib/services/money-accounts";
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
    const acc = await getMoneyAccount(id, user.id);
    if (!acc) throw new NotFoundError("Money account not found");
    return ok(acc);
  },
);

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updateMoneyAccountSchema);
    const updated = await updateMoneyAccount(id, input, user.id, audit(req));
    return ok(updated);
  },
);

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteMoneyAccount(id, user.id, audit(req));
    return ok({ deleted: true });
  },
);
