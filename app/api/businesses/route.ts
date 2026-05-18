/**
 * POST /api/businesses — create a business; the caller becomes its `owner`.
 * GET  /api/businesses — list businesses the caller is a member of.
 */
import { ok, parseJson, route } from "@/lib/http";
import { createBusinessSchema } from "@/lib/schemas/business";
import {
  createBusiness,
  listBusinessesForUser,
} from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createBusinessSchema);

  const created = await createBusiness(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return ok(created, { status: 201 });
});

export const GET = route(async () => {
  const user = await requireUser();
  const rows = await listBusinessesForUser(user.id);
  return ok({ businesses: rows });
});
