/**
 * GET /api/ifsc/[code] — IFSC lookup via Razorpay's free public endpoint.
 *
 * `https://ifsc.razorpay.com/<ifsc>` returns:
 *   { BANK, BRANCH, ADDRESS, CITY, STATE, CONTACT, IFSC, MICR, ... }
 *
 * Why server-proxy instead of calling from the browser:
 *   1. CORS — Razorpay's endpoint doesn't set Access-Control-Allow-Origin,
 *      so a direct browser fetch fails
 *   2. Auth gate — we want lookups behind requireUser to bound noise
 *   3. Future cache — if traffic grows, we can add a small in-memory or
 *      Redis cache here without touching the UI
 */
import { ValidationError, NotFoundError, AppError } from "@/lib/errors";
import { ok, route } from "@/lib/http";
import { requireUser } from "@/lib/session";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

interface RazorpayIfscResponse {
  BANK: string;
  BRANCH: string;
  ADDRESS?: string;
  CITY?: string;
  STATE?: string;
  CONTACT?: string;
  IFSC: string;
  MICR?: string;
  UPI?: boolean;
}

export const GET = route(
  async (_req, ctx: { params: Promise<{ code: string }> }) => {
    await requireUser();
    const { code } = await ctx.params;
    const ifsc = code.trim().toUpperCase();
    if (!IFSC_RE.test(ifsc)) {
      throw new ValidationError(
        "IFSC must be 11 chars: 4 letters + '0' + 6 alphanumerics",
      );
    }

    let res: Response;
    try {
      res = await globalThis.fetch(`https://ifsc.razorpay.com/${ifsc}`, {
        method: "GET",
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      throw new AppError(
        `IFSC lookup is temporarily unavailable: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { status: 503, code: "IFSC_LOOKUP_UNAVAILABLE" },
      );
    }

    if (res.status === 404) {
      throw new NotFoundError("No bank found for this IFSC");
    }
    if (!res.ok) {
      throw new AppError(`IFSC lookup failed: ${res.status}`, {
        status: 503,
        code: "IFSC_LOOKUP_UNAVAILABLE",
      });
    }

    const json = (await res.json()) as RazorpayIfscResponse;
    return ok({
      ifsc: json.IFSC,
      bankName: json.BANK ?? null,
      branchName: json.BRANCH ?? null,
      address: json.ADDRESS ?? null,
      city: json.CITY ?? null,
      state: json.STATE ?? null,
      contact: json.CONTACT ?? null,
      micr: json.MICR ?? null,
      upiSupported: json.UPI ?? false,
    });
  },
);
