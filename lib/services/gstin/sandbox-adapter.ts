/**
 * Sandbox API adapter for GSTIN lookup.
 *
 * Sandbox API — api.sandbox.co.in — exposes a GSTIN search endpoint that
 * proxies the GSTN public search. Pricing: ~₹1/call after a free trial
 * tier. Auth is API-key based (no OAuth flow); the key sits in
 * `SANDBOX_API_KEY` + `SANDBOX_API_SECRET` env vars and never reaches the
 * client.
 *
 * Endpoint (Authenticate → Search):
 *   POST https://api.sandbox.co.in/authenticate
 *     headers: x-api-key, x-api-secret, x-api-version: 1.0
 *     returns: { access_token, expires_at }
 *   GET  https://api.sandbox.co.in/gst/compliance/public/gstin/{gstin}
 *     headers: authorization: <access_token>, x-api-key, x-api-version: 1.0
 *
 * Response shape (subset we care about, observed in their docs):
 *   { code, timestamp, data: {
 *       gstin, lgnm: legalName, tradeNam: tradeName, sts: status,
 *       rgdt: registrationDate (DD/MM/YYYY), ctb: businessType,
 *       pradr: { addr: { bno, st, loc, dst, stcd, pncd }, ... }
 *     }
 *   }
 *
 * We pluck the principal address only (pradr) — alternative branch
 * addresses live elsewhere in the payload and aren't material for the
 * "fill the party form" use case.
 *
 * Re-auth: the access token is cached in-process. Vercel functions cold-
 * start often enough that a single auth call per warm instance is fine;
 * a per-deploy expectation of ~10–20 auths total is well within Sandbox's
 * limits.
 */
import "server-only";

import {
  type GstinAddress,
  GstinAdapterUnavailableError,
  type GstinLookupAdapter,
  GstinNotFoundError,
  type GstinProfile,
} from "./types";

const SANDBOX_HOST = "https://api.sandbox.co.in";
const API_VERSION = "1.0";

interface SandboxAuthResponse {
  access_token: string;
  expires_at: number;
  expires_in: number;
}

interface SandboxAddressBlock {
  bno?: string;
  bnm?: string;
  st?: string;
  loc?: string;
  dst?: string;
  city?: string;
  stcd?: string;
  pncd?: string;
}

interface SandboxLookupResponse {
  code: number;
  timestamp?: number;
  data?: {
    gstin?: string;
    lgnm?: string;
    tradeNam?: string;
    sts?: string;
    rgdt?: string;
    ctb?: string;
    pradr?: { addr?: SandboxAddressBlock; adr?: string };
  };
  error?: string;
  message?: string;
}

function joinAddressLine(addr: SandboxAddressBlock): string | null {
  const parts = [addr.bno, addr.bnm, addr.st, addr.loc]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function parseRegDate(input: string | undefined): string | null {
  if (!input) return null;
  // Sandbox returns DD/MM/YYYY — convert to ISO YYYY-MM-DD for our `date`.
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

export class SandboxGstinAdapter implements GstinLookupAdapter {
  readonly name = "sandbox";

  private readonly apiKey: string;
  private readonly apiSecret: string;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(opts: { apiKey: string; apiSecret: string }) {
    this.apiKey = opts.apiKey;
    this.apiSecret = opts.apiSecret;
  }

  async fetch(gstin: string): Promise<GstinProfile> {
    const token = await this.getAccessToken();

    let res: Response;
    try {
      res = await globalThis.fetch(
        `${SANDBOX_HOST}/gst/compliance/public/gstin/${gstin}`,
        {
          method: "GET",
          headers: {
            authorization: token,
            "x-api-key": this.apiKey,
            "x-api-version": API_VERSION,
            accept: "application/json",
          },
          // 8s — typical p95 from their docs is ~2s, leaves headroom for
          // GSTN backend slowness without holding the route too long.
          signal: AbortSignal.timeout(8_000),
        },
      );
    } catch (err) {
      throw new GstinAdapterUnavailableError(
        `Sandbox lookup network error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (res.status === 404) {
      throw new GstinNotFoundError(gstin);
    }
    if (res.status === 401 || res.status === 403) {
      // Bad key / expired auth — invalidate the cached token and surface as
      // unavailable. The next call will reauth.
      this.cachedToken = null;
      throw new GstinAdapterUnavailableError(
        `Sandbox auth rejected (${res.status})`,
      );
    }
    if (!res.ok) {
      throw new GstinAdapterUnavailableError(
        `Sandbox lookup failed: ${res.status}`,
      );
    }

    const json = (await res.json()) as SandboxLookupResponse;
    if (json.code === 404 || !json.data || !json.data.gstin) {
      throw new GstinNotFoundError(gstin);
    }

    const data = json.data;
    const addr = data.pradr?.addr ?? {};
    const address: GstinAddress = {
      streetAddress: joinAddressLine(addr),
      city: (addr.dst ?? addr.city ?? addr.loc ?? null) || null,
      // Sandbox doesn't return the full state name — only the code (`stcd`).
      // The party form looks the name up from INDIAN_STATES at display time,
      // so we leave `state` null here and rely on the caller to derive it
      // from `stateCode`.
      state: null,
      stateCode: (addr.stcd ?? null) || null,
      pincode: (addr.pncd ?? null) || null,
    };

    return {
      gstin: data.gstin ?? gstin,
      legalName: (data.lgnm ?? null) || null,
      tradeName: (data.tradeNam ?? null) || null,
      address,
      status: (data.sts ?? null) || null,
      registrationDate: parseRegDate(data.rgdt),
      businessType: (data.ctb ?? null) || null,
    };
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.token;
    }

    let res: Response;
    try {
      res = await globalThis.fetch(`${SANDBOX_HOST}/authenticate`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "x-api-secret": this.apiSecret,
          "x-api-version": API_VERSION,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      throw new GstinAdapterUnavailableError(
        `Sandbox auth network error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!res.ok) {
      throw new GstinAdapterUnavailableError(
        `Sandbox auth failed: ${res.status}`,
      );
    }

    const json = (await res.json()) as SandboxAuthResponse;
    if (!json.access_token) {
      throw new GstinAdapterUnavailableError(
        "Sandbox auth response missing access_token",
      );
    }

    const expiresAt =
      typeof json.expires_at === "number"
        ? json.expires_at * 1000
        : now + (json.expires_in ?? 3600) * 1000;
    this.cachedToken = { token: json.access_token, expiresAt };
    return json.access_token;
  }
}
