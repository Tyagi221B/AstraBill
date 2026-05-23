/**
 * POST /api/party-custom-fields — create a definition.
 * GET  /api/party-custom-fields?businessId=… — list workspace definitions.
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createPartyCustomFieldDefSchema,
  listPartyCustomFieldDefsQuerySchema,
} from "@/lib/schemas/party-custom-field";
import {
  createPartyCustomFieldDef,
  listPartyCustomFieldDefsForUser,
} from "@/lib/services/party-custom-fields";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createPartyCustomFieldDefSchema);
  const def = await createPartyCustomFieldDef(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(def, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listPartyCustomFieldDefsQuerySchema);
  const defs = await listPartyCustomFieldDefsForUser({
    userId: user.id,
    businessId: query.businessId,
  });
  return ok({ definitions: defs });
});
