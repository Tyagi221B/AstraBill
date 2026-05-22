/**
 * POST /api/document-counters/seed — bulk-seed counters for the current FY.
 *
 * Used by the onboarding wizard's Step 2 (numbering seed). Idempotent for
 * fresh businesses; refuses to push a counter backwards below an already-
 * issued number.
 */
import { ok, parseJson, route } from "@/lib/http";
import { seedDocumentCountersRequestSchema } from "@/lib/schemas/document-counter";
import { seedCountersForBusiness } from "@/lib/services/document-counters";
import { requireUser } from "@/lib/session";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, seedDocumentCountersRequestSchema);
  await seedCountersForBusiness({
    businessId: input.businessId,
    actorUserId: user.id,
    seeds: input.seeds,
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return ok({ seeded: input.seeds.length });
});
