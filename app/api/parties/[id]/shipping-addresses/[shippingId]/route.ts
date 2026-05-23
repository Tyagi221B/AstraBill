/**
 * PATCH  /api/parties/[id]/shipping-addresses/[shippingId] — update
 * DELETE /api/parties/[id]/shipping-addresses/[shippingId] — soft-delete
 */
import { ok, parseJson, route } from "@/lib/http";
import { updatePartyShippingAddressSchema } from "@/lib/schemas/party-shipping-address";
import {
  deletePartyShippingAddress,
  updatePartyShippingAddress,
} from "@/lib/services/party-shipping-addresses";
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
    ctx: { params: Promise<{ id: string; shippingId: string }> },
  ) => {
    const user = await requireUser();
    const { id, shippingId } = await ctx.params;
    const input = await parseJson(req, updatePartyShippingAddressSchema);
    const updated = await updatePartyShippingAddress(
      id,
      shippingId,
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
    ctx: { params: Promise<{ id: string; shippingId: string }> },
  ) => {
    const user = await requireUser();
    const { id, shippingId } = await ctx.params;
    await deletePartyShippingAddress(id, shippingId, user.id, audit(req));
    return ok({ deleted: true });
  },
);
