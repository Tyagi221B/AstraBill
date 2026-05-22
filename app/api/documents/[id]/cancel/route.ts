/**
 * POST /api/documents/[id]/cancel — finalised → cancelled.
 *
 * Writes reversal ledger entries + negated stock movements, all in one tx.
 * Refused if the doc has recorded payments (caller must void payments
 * first).
 */
import { ok, parseJson, route } from "@/lib/http";
import { cancelDocumentSchema } from "@/lib/schemas/document";
import { cancelDocument } from "@/lib/services/documents";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, cancelDocumentSchema);
    const doc = await cancelDocument(id, input, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return ok(doc);
  },
);
