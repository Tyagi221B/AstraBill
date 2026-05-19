/**
 * POST /api/invoices/[id]/send-whatsapp — deliver the `astrabill_invoice`
 * template to the invoice's customer over Meta Cloud API.
 *
 * Idempotent from the customer's perspective only by accident — every POST
 * is a fresh send (a "resend"). The route does no debouncing; the UI
 * handles "are you sure you want to resend?".
 *
 * Failure modes (mapped to HTTP by the route wrapper):
 *   404 — invoice not found / not a member
 *   403 — role lacks `whatsapp:send`
 *   409 — invoice is still a draft
 *   422 — customer has no phone
 *   502 — Meta rejected the send (already logged on the message row)
 */
import { ok, route } from "@/lib/http";
import { sendInvoiceOnWhatsApp } from "@/lib/services/whatsapp-send";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const result = await sendInvoiceOnWhatsApp(id, user.id);
    return ok(result);
  },
);
