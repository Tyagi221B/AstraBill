/**
 * GET  /api/parties/[id]/shipping-addresses — list active shipping rows
 * POST /api/parties/[id]/shipping-addresses — add a new shipping row
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { createPartyShippingAddressSchema } from "@/lib/schemas/party-shipping-address";
import { getParty } from "@/lib/services/parties";
import {
  createPartyShippingAddress,
  listShippingAddressesForParty,
} from "@/lib/services/party-shipping-addresses";
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
    const addresses = await listShippingAddressesForParty(id);
    return ok({ addresses });
  },
);

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, createPartyShippingAddressSchema);
    const address = await createPartyShippingAddress(
      id,
      input,
      user.id,
      audit(req),
    );
    return ok(address, { status: 201 });
  },
);
