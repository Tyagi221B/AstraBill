/**
 * Share-token generator — the 16-char URL-safe identifier behind the
 * customer-facing `/i/[shareToken]` invoice view.
 *
 * Why 16 chars (12 random bytes, base64url):
 *   - 12 random bytes = 96 bits of entropy → unguessable by enumeration.
 *   - base64url encodes 12 bytes into exactly 16 chars with no padding
 *     (`-` and `_` instead of `+` / `/`; no `=`), so the token drops into
 *     a URL path segment without escaping.
 *
 * Why NOT the invoice UUID:
 *   - The UUID is our internal id. Exposing it in a customer-shared URL
 *     would let anyone with one URL probe nearby invoices by guessing
 *     adjacent ids. The share token is a separate, opaque, unguessable
 *     handle — one-way ticket from URL to invoice.
 *
 * Uniqueness is enforced by a database constraint on `invoices.share_token`
 * (a unique index). Collisions are astronomically unlikely at 96 bits, but
 * a hypothetical duplicate on insert surfaces as a 23505 — the caller can
 * retry with a fresh token.
 */
import { randomBytes } from "node:crypto";

/** A fresh 16-char URL-safe share token. */
export function generateShareToken(): string {
  return randomBytes(12).toString("base64url");
}
