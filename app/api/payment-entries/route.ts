/**
 * POST /api/payment-entries — record a payment (in or out).
 * GET  /api/payment-entries — list recent payments.
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createPaymentEntrySchema,
  listPaymentEntriesQuerySchema,
} from "@/lib/schemas/payment-entry";
import {
  listPaymentEntriesForUser,
  recordPayment,
} from "@/lib/services/payment-entries";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createPaymentEntrySchema);
  const entry = await recordPayment(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(entry, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listPaymentEntriesQuerySchema);
  const payments = await listPaymentEntriesForUser({
    userId: user.id,
    businessId: query.businessId,
    partyId: query.partyId,
    limit: query.limit,
  });
  return ok({ payments });
});
