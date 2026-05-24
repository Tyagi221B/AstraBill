/**
 * GSTIN lookup — vendor-neutral types.
 *
 * Every concrete adapter (Sandbox, Setu, Cleartax, …) returns this normalised
 * `GstinProfile` shape. The cache table mirrors it column-for-column, so a
 * cache hit is a single SELECT with no parse step.
 *
 * Errors are typed so the service layer + UI can render specific copy:
 *   - GstinNotFoundError       → "No record found for this GSTIN"
 *   - GstinInvalidError        → "Format is invalid" (server-side guard)
 *   - GstinAdapterUnavailable  → "Lookup is temporarily down" (vendor 5xx)
 *
 * The 15-char format and uppercase casing are enforced before the adapter
 * is called — adapters never see a malformed input.
 */

export interface GstinAddress {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  /** Two-digit GST state code, e.g. "27" for Maharashtra. */
  stateCode: string | null;
  pincode: string | null;
}

export interface GstinProfile {
  /** Always uppercase, always 15 chars. */
  gstin: string;
  /**
   * 10-char PAN derived from the GSTIN itself (chars 3-12 by spec).
   * Sandbox doesn't return PAN as a separate field — it's embedded in
   * the GSTIN, so we slice it locally. Never null when `gstin` is valid.
   */
  pan: string;
  /** Legal name (matches PAN). Some sole-proprietorships only have a trade
   *  name; this can be null when the vendor returns a blank for it. */
  legalName: string | null;
  /** Doing-business-as. Often empty for proprietorships. */
  tradeName: string | null;
  address: GstinAddress;
  /** Vendor-passthrough: "Active" / "Cancelled" / "Suspended" / "Provisional". */
  status: string | null;
  /** YYYY-MM-DD. */
  registrationDate: string | null;
  /** "Regular" / "Composition" / "Casual" / "Non-Resident". */
  businessType: string | null;
}

/** Spec-derived: GSTIN positions 3-12 are the entity's PAN. */
export function panFromGstin(gstin: string): string {
  return gstin.slice(2, 12);
}

export interface GstinLookupAdapter {
  /** Identifier persisted on the cache row's `vendor` column. */
  readonly name: string;
  /**
   * Resolve a single GSTIN. Input is guaranteed to be 15-char uppercase
   * alphanumeric — adapters MUST NOT re-validate format.
   *
   * Throw GstinNotFoundError if the vendor explicitly says "not found".
   * Throw GstinAdapterUnavailableError for transient vendor errors (5xx,
   * timeout, network) — the service layer can fall back to a stale cache
   * hit when this fires.
   */
  fetch(gstin: string): Promise<GstinProfile>;
}

export class GstinNotFoundError extends Error {
  readonly code = "GSTIN_NOT_FOUND" as const;
  constructor(gstin: string) {
    super(`GSTIN ${gstin} not found at vendor`);
  }
}

export class GstinInvalidError extends Error {
  readonly code = "GSTIN_INVALID" as const;
  constructor(message = "GSTIN must be 15 alphanumeric characters (uppercase)") {
    super(message);
  }
}

export class GstinAdapterUnavailableError extends Error {
  readonly code = "GSTIN_ADAPTER_UNAVAILABLE" as const;
  constructor(message: string) {
    super(message);
  }
}

/** 15-char alphanumeric uppercase. */
const GSTIN_RE = /^[0-9A-Z]{15}$/;

/**
 * Normalise + validate. Returns the uppercased GSTIN, or throws
 * `GstinInvalidError` if the input doesn't fit the format. Use this at every
 * entry point (API route, service) so the cache + adapter never see junk.
 */
export function normaliseGstin(input: string): string {
  const upper = input.trim().toUpperCase();
  if (!GSTIN_RE.test(upper)) {
    throw new GstinInvalidError();
  }
  return upper;
}
