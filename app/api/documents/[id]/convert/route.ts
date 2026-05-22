/**
 * POST /api/documents/[id]/convert — convert a finalised quotation into a
 * draft sales_invoice. Copies lines + charges; sets source_doc_id for lineage.
 */
import { ok, route } from "@/lib/http";
import { convertQuotationToInvoice } from "@/lib/services/documents";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const newDoc = await convertQuotationToInvoice(id, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return ok(newDoc, { status: 201 });
  },
);
