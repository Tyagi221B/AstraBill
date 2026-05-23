/**
 * PATCH  /api/parties/[id]/bank-accounts/[accountId] — update
 * DELETE /api/parties/[id]/bank-accounts/[accountId] — soft-delete
 */
import { ok, parseJson, route } from "@/lib/http";
import { updatePartyBankAccountSchema } from "@/lib/schemas/party-bank-account";
import {
  deletePartyBankAccount,
  updatePartyBankAccount,
} from "@/lib/services/party-bank-accounts";
import { requireUser } from "@/lib/session";

function audit(req: Request) {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}

export const PATCH = route(
  async (
    req,
    ctx: { params: Promise<{ id: string; accountId: string }> },
  ) => {
    const user = await requireUser();
    const { id, accountId } = await ctx.params;
    const input = await parseJson(req, updatePartyBankAccountSchema);
    const updated = await updatePartyBankAccount(
      id,
      accountId,
      input,
      user.id,
      audit(req),
    );
    return ok(updated);
  },
);

export const DELETE = route(
  async (
    req,
    ctx: { params: Promise<{ id: string; accountId: string }> },
  ) => {
    const user = await requireUser();
    const { id, accountId } = await ctx.params;
    await deletePartyBankAccount(id, accountId, user.id, audit(req));
    return ok({ deleted: true });
  },
);
