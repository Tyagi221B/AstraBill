/**
 * Sandbox API adapter for GSTIN lookup.
 *
 * Endpoint (Authenticate → Search):
 *   POST https://api.sandbox.co.in/authenticate
 *     headers: x-api-key, x-api-secret, x-api-version: 1.0
 *     returns: a JWT token under `access_token` (and/or `data.access_token`)
 *
 *   POST https://api.sandbox.co.in/gst/compliance/public/gstin/search
 *     headers: authorization: <token>   ← raw JWT, NO "Bearer " prefix
 *              x-api-key, x-api-version: 1.0, content-type: application/json
 *     body:    { "gstin": "<15-char-uppercase>" }
 *
 * Response shape note: the docs index lists the endpoint but doesn't show
 * the response body verbatim, and an earlier guess at the shape lost us
 * the first round of prod traffic to false-404s. This implementation:
 *   - parses leniently (tries `data.*`, `result.*`, and top-level)
 *   - on ANY non-success or shape mismatch, console.errors the raw body
 *     (sans secrets) so the next attempt produces ground-truth in logs
 *
 * Auth caching is in-process. Vercel functions cold-start often enough
 * that a single auth call per warm instance is acceptable.
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
// Sandbox pins `x-api-version` per-endpoint, not per-product. Confirmed from
// their cURL samples: /authenticate wants "1.0.0", /gstin/search wants "1.0".
// Same constant for both = one of them silently fails. Keep these separate.
const AUTH_API_VERSION = "1.0.0";
const LOOKUP_API_VERSION = "1.0";

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

interface SandboxGstinDataBlock {
  gstin?: string;
  lgnm?: string;
  tradeNam?: string;
  sts?: string;
  rgdt?: string;
  ctb?: string;
  pradr?: { addr?: SandboxAddressBlock; adr?: string };
}

/** Lenient lookup-response envelope — Sandbox has flipped between top-
 *  level, `data`, and `result` across product lines. We accept any. */
interface SandboxLookupEnvelope {
  code?: number | string;
  http_response_code?: number;
  message?: string;
  data?: SandboxGstinDataBlock;
  result?: SandboxGstinDataBlock;
  // ...or the data block lives at top level
  gstin?: string;
  lgnm?: string;
  tradeNam?: string;
  pradr?: { addr?: SandboxAddressBlock };
}

interface SandboxAuthEnvelope {
  // Different Sandbox endpoints have surfaced the token under any of these.
  access_token?: string;
  accessToken?: string;
  token?: string;
  data?: {
    access_token?: string;
    accessToken?: string;
    token?: string;
    expires_at?: number;
    expires_in?: number;
  };
  expires_at?: number;
  expires_in?: number;
}

function joinAddressLine(addr: SandboxAddressBlock): string | null {
  const parts = [addr.bno, addr.bnm, addr.st, addr.loc]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function parseRegDate(input: string | undefined): string | null {
  if (!input) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Pick the data block from any of the known envelope shapes. Returns
 *  `null` only if NONE of them contain a `gstin`. */
function extractDataBlock(
  env: SandboxLookupEnvelope,
): SandboxGstinDataBlock | null {
  if (env.data?.gstin) return env.data;
  if (env.result?.gstin) return env.result;
  if (env.gstin) {
    // Top-level shape — coerce to data block view.
    return {
      gstin: env.gstin,
      lgnm: env.lgnm,
      tradeNam: env.tradeNam,
      pradr: env.pradr,
    };
  }
  return null;
}

function extractAccessToken(env: SandboxAuthEnvelope): {
  token: string;
  expiresAt: number;
} | null {
  const tok =
    env.access_token ??
    env.accessToken ??
    env.token ??
    env.data?.access_token ??
    env.data?.accessToken ??
    env.data?.token;
  if (!tok) return null;
  const now = Date.now();
  const expiresIn = env.expires_in ?? env.data?.expires_in;
  const expiresAt =
    typeof env.expires_at === "number"
      ? env.expires_at * 1000
      : typeof env.data?.expires_at === "number"
        ? env.data.expires_at * 1000
        : now + (expiresIn ?? 3600) * 1000;
  return { token: tok, expiresAt };
}

/** Read the response body once, safely. Returns the trimmed text (max 800
 *  chars) so we never spam the log stream. Reads as text so a non-JSON
 *  error page still surfaces. */
async function safeBodySnippet(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.length > 800 ? `${text.slice(0, 800)}…(truncated)` : text;
  } catch {
    return "(failed to read body)";
  }
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
        `${SANDBOX_HOST}/gst/compliance/public/gstin/search`,
        {
          method: "POST",
          headers: {
            authorization: token,
            "x-api-key": this.apiKey,
            "x-api-version": LOOKUP_API_VERSION,
            "content-type": "application/json",
          },
          body: JSON.stringify({ gstin }),
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

    if (res.status === 401 || res.status === 403) {
      this.cachedToken = null;
      const body = await safeBodySnippet(res);
      console.error(
        `[sandbox] auth rejected on lookup status=${res.status} body=${body}`,
      );
      throw new GstinAdapterUnavailableError(
        `Sandbox auth rejected (${res.status})`,
      );
    }

    if (!res.ok) {
      const body = await safeBodySnippet(res);
      console.error(
        `[sandbox] lookup non-ok status=${res.status} body=${body}`,
      );
      if (res.status === 404) {
        throw new GstinNotFoundError(gstin);
      }
      throw new GstinAdapterUnavailableError(
        `Sandbox lookup failed: ${res.status}`,
      );
    }

    // OK status — but the docs aren't explicit on shape. Read text first so
    // we can log it on shape miss, then JSON.parse it ourselves.
    const bodyText = await res.text();
    let envelope: SandboxLookupEnvelope;
    try {
      envelope = JSON.parse(bodyText) as SandboxLookupEnvelope;
    } catch {
      console.error(
        `[sandbox] lookup body not JSON status=${res.status} body=${bodyText.slice(0, 800)}`,
      );
      throw new GstinAdapterUnavailableError(
        "Sandbox returned a non-JSON response",
      );
    }

    const data = extractDataBlock(envelope);
    if (!data || !data.gstin) {
      // Could be a "code=404" / "no record" response, or a shape we haven't
      // seen yet. Log the body so we can either fix the parser or confirm
      // it's a genuine not-found.
      console.error(
        `[sandbox] lookup found no data block gstin=${gstin} body=${bodyText.slice(0, 800)}`,
      );
      // If the envelope explicitly says 404, treat as not-found; otherwise
      // surface as adapter-unavailable so the UI doesn't claim "no record"
      // when the real issue is a shape mismatch.
      if (envelope.code === 404 || envelope.http_response_code === 404) {
        throw new GstinNotFoundError(gstin);
      }
      throw new GstinAdapterUnavailableError(
        envelope.message ?? "Sandbox returned an unexpected response shape",
      );
    }

    const addr = data.pradr?.addr ?? {};
    const address: GstinAddress = {
      streetAddress: joinAddressLine(addr),
      city: (addr.dst ?? addr.city ?? addr.loc ?? null) || null,
      state: null,
      stateCode: (addr.stcd ?? null) || null,
      pincode: (addr.pncd ?? null) || null,
    };

    return {
      gstin: data.gstin,
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
          "x-api-version": AUTH_API_VERSION,
          // Sandbox's auth cURL example sets Content-Type even though there's
          // no body. Matching exactly to dodge any strict header validation.
          "content-type": "application/json",
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
      const body = await safeBodySnippet(res);
      console.error(
        `[sandbox] auth non-ok status=${res.status} body=${body}`,
      );
      throw new GstinAdapterUnavailableError(
        `Sandbox auth failed: ${res.status}`,
      );
    }

    const bodyText = await res.text();
    let envelope: SandboxAuthEnvelope;
    try {
      envelope = JSON.parse(bodyText) as SandboxAuthEnvelope;
    } catch {
      console.error(
        `[sandbox] auth body not JSON body=${bodyText.slice(0, 400)}`,
      );
      throw new GstinAdapterUnavailableError(
        "Sandbox auth returned a non-JSON response",
      );
    }

    const extracted = extractAccessToken(envelope);
    if (!extracted) {
      console.error(
        `[sandbox] auth response had no recognised token field body=${bodyText.slice(0, 400)}`,
      );
      throw new GstinAdapterUnavailableError(
        "Sandbox auth response missing access_token",
      );
    }

    this.cachedToken = extracted;
    return extracted.token;
  }
}
