/**
 * POST /api/money-accounts/transfer — move money between two accounts.
 *
 * Writes a paired transfer_out / transfer_in ledger entry with a fresh
 * shared `transfer_pair_id`. Service enforces both legs are in the same
 * business.
 */
import { ok, parseJson, route } from "@/lib/http";
import { transferMoneyAccountSchema } from "@/lib/schemas/money-account";
import { transferBetweenMoneyAccounts } from "@/lib/services/money-accounts";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, transferMoneyAccountSchema);
  const result = await transferBetweenMoneyAccounts(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(result);
});
