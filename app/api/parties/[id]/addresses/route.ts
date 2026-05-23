/**
 * GET /api/parties/[id]/addresses
 *
 * Returns the party's billing + all active shipping addresses. Used by
 * document-creation forms to populate the Bill-to / Ship-to picker without
 * loading every party's full address graph upfront.
 *
 * Multi-shipping landed in PR7-E. Response shape:
 *   { billing: PartyAddress | null,
 *     shippingAddresses: PartyAddress[]   // default first, then by created
 *   }
 *
 * Membership-scoped via `getParty`; non-members get 404 (no existence leak).
 */
import { NotFoundError } from "@/lib/errors";
import { ok, route } from "@/lib/http";
import {
  getBillingAddressForParty,
  listShippingAddressesForParty,
} from "@/lib/repositories/party-addresses";
import { getParty } from "@/lib/services/parties";
import { requireUser } from "@/lib/session";

export const GET = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const party = await getParty(id, user.id);
    if (!party) throw new NotFoundError("Party not found");

    const [billing, shippingAddresses] = await Promise.all([
      getBillingAddressForParty(id),
      listShippingAddressesForParty(id),
    ]);

    return ok({ billing, shippingAddresses });
  },
);
