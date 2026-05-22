/**
 * POST /api/documents — create a document (draft).
 * GET  /api/documents — list documents (optionally filtered).
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createDocumentSchema,
  listDocumentsQuerySchema,
} from "@/lib/schemas/document";
import {
  createDocument,
  listDocumentsForUser,
} from "@/lib/services/documents";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createDocumentSchema);
  const doc = await createDocument(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(doc, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listDocumentsQuerySchema);
  const documents = await listDocumentsForUser({
    userId: user.id,
    businessId: query.businessId,
    docType: query.docType,
    status: query.status,
    partyId: query.partyId,
    limit: query.limit,
  });
  return ok({ documents });
});
