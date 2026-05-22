/**
 * GET    /api/documents/[id] — fetch one (membership-scoped).
 * PATCH  /api/documents/[id] — update (drafts only).
 * DELETE /api/documents/[id] — hard-delete a draft (finalised use /cancel).
 */
import { NotFoundError } from "@/lib/errors";
import { ok, parseJson, route } from "@/lib/http";
import { updateDocumentSchema } from "@/lib/schemas/document";
import {
  deleteDraftDocument,
  getDocumentDetail,
  updateDocument,
} from "@/lib/services/documents";
import { requireUser } from "@/lib/session";

function audit(req: Request) {
  return {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}

export const GET = route(
  async (_req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const detail = await getDocumentDetail(id, user.id);
    if (!detail) throw new NotFoundError("Document not found");
    return ok(detail);
  },
);

export const PATCH = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = await parseJson(req, updateDocumentSchema);
    const updated = await updateDocument(id, input, user.id, audit(req));
    return ok(updated);
  },
);

export const DELETE = route(
  async (req, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteDraftDocument(id, user.id, audit(req));
    return ok({ deleted: true });
  },
);
