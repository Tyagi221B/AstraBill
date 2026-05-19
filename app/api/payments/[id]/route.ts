/**
 * DELETE /api/payments/[id] — void a payment (soft delete).
 *
 * The invoice's amount-paid + status are recomputed in the same transaction.
 * 404 for "doesn't exist / already voided / caller isn't a member"; 403 if
 * the caller's role lacks `payment:delete` (owner / admin only).
 */
import { ok, route } from "@/lib/http";
import { deletePayment } from "@/lib/services/payments";
import { requireUser } from "@/lib/session";

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const result = await deletePayment(id, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });

    return ok(result);
  },
);
