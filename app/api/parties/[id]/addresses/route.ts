/**
 * GET /api/parties/[id]/addresses
 *
 * Returns the party's billing + default shipping addresses (or nulls). Used
 * by document-creation forms to populate Bill-to / Ship-to without loading
 * every party's full address graph upfront. Membership-scoped via
 * `getParty`; non-members get 404 (no existence leak).
 */
import { NotFoundError } from "@/lib/errors";
import { ok, route } from "@/lib/http";
import {
  getBillingAddressForParty,
  getDefaultShippingAddressForParty,
} from "@/lib/repositories/party-addresses";
import { getParty } from "@/lib/services/parties";
import { requireUser } from "@/lib/session";

export const GET = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const party = await getParty(id, user.id);
    if (!party) throw new NotFoundError("Party not found");

    const [billing, shipping] = await Promise.all([
      getBillingAddressForParty(id),
      getDefaultShippingAddressForParty(id),
    ]);

    return ok({ billing, shipping });
  },
);
