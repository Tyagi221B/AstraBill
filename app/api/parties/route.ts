/**
 * POST /api/parties — create a party in the caller's business.
 * GET  /api/parties — list parties the caller can see (optionally one business / type).
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createPartySchema,
  listPartiesQuerySchema,
} from "@/lib/schemas/party";
import {
  createParty,
  listPartiesForUser,
} from "@/lib/services/parties";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createPartySchema);

  const party = await createParty(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(party, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listPartiesQuerySchema);
  const parties = await listPartiesForUser({
    userId: user.id,
    businessId: query.businessId,
    type: query.type,
    limit: query.limit,
  });
  return ok({ parties });
});
