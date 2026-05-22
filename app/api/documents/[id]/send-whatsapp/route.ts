/**
 * POST /api/documents/[id]/send-whatsapp — deliver the `astrabill_invoice_v1`
 * template to the document's party over Meta Cloud API.
 *
 * Sales-invoice-only in V1 (the template's body variables are tuned for
 * that one artifact). Every POST is a fresh send (a "resend"); the route
 * does no debouncing — the UI handles confirm-before-resend.
 *
 * Failure modes (mapped to HTTP by the route wrapper):
 *   404 — document not found / not a member
 *   403 — role lacks `whatsapp:send`
 *   409 — wrong doc type, draft, or cancelled
 *   422 — party has no mobile number
 *   502 — Meta rejected the send (already logged on the message row)
 */
import { ok, route } from "@/lib/http";
import { sendDocumentOnWhatsApp } from "@/lib/services/whatsapp-send";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const result = await sendDocumentOnWhatsApp(id, user.id);
    return ok(result);
  },
);
