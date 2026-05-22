/**
 * GET /api/reports/gstr-1?businessId=…&from=…&to=…&format=csv
 *
 * Returns the B2B sheet of GSTR-1 (JSON by default, CSV when format=csv).
 * The CSV is shaped to paste into the GST portal's offline-utility B2B
 * sheet.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { ok, parseQuery, route } from "@/lib/http";
import { getGstr1B2b, gstr1B2bToCsv } from "@/lib/services/reports";
import { requireUser } from "@/lib/session";

const querySchema = z.object({
  businessId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["csv", "json"]).optional(),
});

export const GET = route(async (req) => {
  const user = await requireUser();
  const q = parseQuery(req, querySchema);
  const rows = await getGstr1B2b({
    userId: user.id,
    businessId: q.businessId,
    from: q.from,
    to: q.to,
  });
  if (q.format === "csv") {
    return new NextResponse(gstr1B2bToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gstr1-b2b-${q.from}-to-${q.to}.csv"`,
      },
    });
  }
  return ok({ rows });
});
