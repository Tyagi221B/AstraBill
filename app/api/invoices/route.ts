/**
 * POST /api/invoices — create an invoice (draft by default).
 *
 * Thin route per the architecture: Zod-validate, extract session + audit
 * context, hand to the service, return the envelope.
 */
import { ok, parseJson, route } from "@/lib/http";
import { createInvoiceSchema } from "@/lib/schemas/invoice";
import { createInvoice } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createInvoiceSchema);

  const invoice = await createInvoice(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return ok(invoice, { status: 201 });
});
