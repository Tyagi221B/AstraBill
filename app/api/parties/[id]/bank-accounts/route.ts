/**
 * GET  /api/parties/[id]/bank-accounts        — list active banks
 * POST /api/parties/[id]/bank-accounts        — add a bank
 *
 * Membership scoping happens inside the service via `getPartyForUserTx`;
 * non-members get 404 on both verbs.
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { createPartyBankAccountSchema } from "@/lib/schemas/party-bank-account";
import { getParty } from "@/lib/services/parties";
import {
  createPartyBankAccount,
  listPartyBankAccountsForParty,
} from "@/lib/services/party-bank-accounts";
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
    const party = await getParty(id, user.id);
    if (!party) throw new NotFoundError("Party not found");
    const banks = await listPartyBankAccountsForParty(id);
    return ok({ banks });
  },
);

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, createPartyBankAccountSchema);
    const bank = await createPartyBankAccount(id, input, user.id, audit(req));
    return ok(bank, { status: 201 });
  },
);
