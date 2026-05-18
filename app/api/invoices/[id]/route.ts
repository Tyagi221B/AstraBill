/**
 * GET /api/invoices/[id] — fetch one invoice with its line items, scoped to
 * the caller's business memberships. Returns 404 (NotFoundError) for both
 * "doesn't exist" and "not a member" — never leak existence to non-members.
 */
import { NotFoundError } from "@/lib/errors";
import { ok, route } from "@/lib/http";
import { getInvoice } from "@/lib/services/invoices";
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
