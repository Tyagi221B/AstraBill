/**
 * POST /api/invoices/[id]/finalize — transition a DRAFT invoice to `sent`.
 *
 * An action endpoint (not a PATCH) — it's a state transition, not a field
 * edit. After finalising, the invoice is immutable: edit + delete are
 * blocked. For V1 this is a manual "mark as sent"; the WhatsApp send feature
 * will later drive the same draft → sent transition.
 */
import { ok, route } from "@/lib/http";
import { finalizeInvoice } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const invoice = await finalizeInvoice(id, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });

    return ok(invoice);
  },
);
