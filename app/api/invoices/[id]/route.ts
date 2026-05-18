/**
 * GET   /api/invoices/[id]  — fetch one invoice + line items (membership-scoped).
 * PATCH /api/invoices/[id]  — update a DRAFT invoice (full line-item replacement).
 *
 * Both return 404 for "doesn't exist OR not a member" — same response for
 * both, no existence leak.
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { updateInvoiceSchema } from "@/lib/schemas/invoice";
import { getInvoice, updateInvoice } from "@/lib/services/invoices";
import { requireUser } from "@/lib/session";

export const GET = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const invoice = await getInvoice(id, user.id);
    if (!invoice) throw new NotFoundError("Invoice not found");

    return ok(invoice);
  },
);

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updateInvoiceSchema);

    const updated = await updateInvoice(id, input, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });

    return ok(updated);
  },
);
