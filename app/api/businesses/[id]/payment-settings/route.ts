/**
 * PATCH /api/businesses/[id]/payment-settings — update a business's
 * payment-collection settings (V1: `upiId` — the VPA the public share-page
 * "Pay" button targets).
 *
 * Owner-only at the service layer (`settings:edit`). 404 for "doesn't exist
 * OR not a member" — no existence leak.
 */
import { ok, parseJson, route } from "@/lib/http";
import { updatePaymentSettingsSchema } from "@/lib/schemas/business";
import { updateBusinessPaymentSettings } from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";

function audit(req: Request) {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updatePaymentSettingsSchema);
    const updated = await updateBusinessPaymentSettings(
      id,
      input,
      user.id,
      audit(req),
    );
    return ok(updated);
  },
);
