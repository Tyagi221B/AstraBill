/**
 * POST /api/money-accounts        — create (with optional opening balance).
 * GET  /api/money-accounts?businessId=… — list for a business.
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createMoneyAccountSchema,
  listMoneyAccountsQuerySchema,
} from "@/lib/schemas/money-account";
import {
  createMoneyAccount,
  listMoneyAccountsForUser,
} from "@/lib/services/money-accounts";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createMoneyAccountSchema);
  const account = await createMoneyAccount(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(account, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listMoneyAccountsQuerySchema);
  const accounts = await listMoneyAccountsForUser({
    userId: user.id,
    businessId: query.businessId,
  });
  return ok({ accounts });
});
