/**
 * POST /api/invoices/[id]/payments — record a payment against an invoice.
 * GET  /api/invoices/[id]/payments — list the payments on an invoice.
 *
 * Both 404 for "invoice doesn't exist OR caller isn't a member" — same
 * response, no existence leak. POST additionally 403s if the caller's role
 * lacks `payment:record`, and 409s on a still-draft invoice.
 */
import { ok, parseJson, route } from "@/lib/http";
import { recordPaymentSchema } from "@/lib/schemas/payment";
import { listInvoicePayments, recordPayment } from "@/lib/services/payments";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, recordPaymentSchema);

    const result = await recordPayment(id, input, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });

    return ok(result, { status: 201 });
  },
);

export const GET = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const payments = await listInvoicePayments(id, user.id);
    return ok(payments);
  },
);
