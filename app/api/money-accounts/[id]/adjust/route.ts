/**
 * POST /api/money-accounts/[id]/adjust — Add or Reduce money on one account.
 *
 * Writes a single `manual_adjustment` ledger entry under the standard tx
 * pattern. The service signs the amount based on `direction`.
 */
import { ok, parseJson, route } from "@/lib/http";
import { adjustMoneyAccountSchema } from "@/lib/schemas/money-account";
import { adjustMoneyAccountBalance } from "@/lib/services/money-accounts";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, adjustMoneyAccountSchema);
    const result = await adjustMoneyAccountBalance(id, input, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return ok(result);
  },
);
