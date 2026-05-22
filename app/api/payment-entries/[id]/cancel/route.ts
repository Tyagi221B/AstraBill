/**
 * POST /api/payment-entries/[id]/cancel — void a recorded payment.
 *
 * Writes reversal ledger rows + refreshes documents' amount_received.
 */
import { ok, parseJson, route } from "@/lib/http";
import { cancelPaymentEntrySchema } from "@/lib/schemas/payment-entry";
import { cancelPayment } from "@/lib/services/payment-entries";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, cancelPaymentEntrySchema);
    const entry = await cancelPayment(id, input, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return ok(entry);
  },
);
