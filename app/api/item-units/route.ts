/**
 * GET /api/item-units?businessId=… — list system units + this workspace's
 * custom units. Used by the item form's unit dropdown.
 */
import { z } from "zod";

import { ok, parseQuery, route } from "@/lib/http";
import { listUnitsForUser } from "@/lib/repositories/item-units";
import { requireUser } from "@/lib/session";

const querySchema = z.object({ businessId: z.string().uuid() });

export const GET = route(async (req) => {
  const user = await requireUser();
  const { businessId } = parseQuery(req, querySchema);
  const units = await listUnitsForUser({ userId: user.id, businessId });
  return ok({ units });
});
