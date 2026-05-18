/**
 * POST /api/invoices — create an invoice (draft by default).
 * GET  /api/invoices — list the caller's invoices, optionally filtered by
 *                      businessId and/or status.
 *
 * Thin route per the architecture: Zod-validate, extract session + audit
 * context, hand to the service, return the envelope.
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
} from "@/lib/schemas/invoice";
import {
  createInvoice,
  listInvoicesForUser,
} from "@/lib/services/invoices";
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

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listInvoicesQuerySchema);
  const invoices = await listInvoicesForUser({
    userId: user.id,
    businessId: query.businessId,
    status: query.status,
    limit: query.limit,
  });
  return ok({ invoices });
});
