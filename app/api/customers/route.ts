/**
 * POST /api/customers — create a customer in the caller's business.
 * GET  /api/customers — list customers the caller can see (optionally one business).
 */
import { ok, parseJson, parseQuery, route } from "@/lib/http";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
} from "@/lib/schemas/customer";
import {
  createCustomer,
  listCustomersForUser,
} from "@/lib/services/customers";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, createCustomerSchema);

  const customer = await createCustomer(input, user.id, {
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok(customer, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = parseQuery(req, listCustomersQuerySchema);
  const customers = await listCustomersForUser({
    userId: user.id,
    businessId: query.businessId,
    limit: query.limit,
  });
  return ok({ customers });
});
