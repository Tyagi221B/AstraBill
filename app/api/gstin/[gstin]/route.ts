/**
 * GET /api/gstin/[gstin] — fetch a GSTIN profile via the cache-first
 * lookup service. Auth-only (no business membership check) — the data is
 * public, but login-gating bounds the per-call vendor cost.
 *
 * Errors are mapped at the route boundary:
 *   - GstinInvalidError       → 400
 *   - GstinNotFoundError      → 404
 *   - GstinAdapterUnavailable → 503
 *
 * The response shape is the GstinLookupResult — UI consumes
 * { profile, source, vendor, fetchedAt }.
 */
import { ValidationError, NotFoundError, AppError } from "@/lib/errors";
import { ok, route } from "@/lib/http";
import {
  GstinAdapterUnavailableError,
  GstinInvalidError,
  GstinNotFoundError,
  lookupGstin,
} from "@/lib/services/gstin";
import { requireUser } from "@/lib/session";

export const GET = route(
  async (_req, ctx: { params: Promise<{ gstin: string }> }) => {
    await requireUser();
    const { gstin } = await ctx.params;

    try {
      const result = await lookupGstin(gstin);
      return ok(result);
    } catch (err) {
      if (err instanceof GstinInvalidError) {
        throw new ValidationError(err.message);
      }
      if (err instanceof GstinNotFoundError) {
        throw new NotFoundError("No GST record found for this GSTIN");
      }
      if (err instanceof GstinAdapterUnavailableError) {
        // Map to a 503-shaped AppError so the toast says "try again".
        throw new AppError(
          "GSTIN lookup is temporarily unavailable. Try again in a moment.",
          { status: 503, code: "GSTIN_ADAPTER_UNAVAILABLE" },
        );
      }
      throw err;
    }
  },
);
