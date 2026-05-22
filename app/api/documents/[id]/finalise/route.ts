/**
 * POST /api/documents/[id]/finalise — draft → unpaid.
 *
 * Reserves the next FY-aware document number (FOR UPDATE on the counter
 * row), posts the ledger leg per the doc_type's policy, writes any stock
 * movements, all in one transaction.
 */
import { ok, route } from "@/lib/http";
import { finaliseDocument } from "@/lib/services/documents";
import { requireUser } from "@/lib/session";

export const POST = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const doc = await finaliseDocument(id, user.id, {
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return ok(doc);
  },
);
