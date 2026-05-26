/**
 * Cloudinary — server-side signing for direct browser uploads.
 *
 * Security model (DECISIONS — Logo upload):
 *   - The API SECRET lives only here, server-side. It never goes to the
 *     browser. It only ever *signs* upload params.
 *   - The browser uploads the file straight to Cloudinary with a signature
 *     this module produced — the file never passes through Next.js.
 *   - Signing is delegated to the official `cloudinary` SDK
 *     (`utils.api_sign_request`) — never hand-rolled crypto for a
 *     security-critical signature.
 *   - `isOurCloudinaryUrl` gates what a PATCH may store as `logo_url`, so a
 *     crafted request can't point the invoice renderer at an arbitrary host.
 */
import "server-only";
import { v2 as cloudinary } from "cloudinary";

/** Throws if the Cloudinary env trio isn't configured. */
function config(): { cloudName: string; apiKey: string; apiSecret: string } {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, " +
        "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.local.",
    );
  }
  return { cloudName, apiKey, apiSecret };
}

/** True when Cloudinary creds are present — callers can 503 cleanly if not. */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

export interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  /** Display folder (Dynamic Folder Mode) the upload is pinned to. */
  assetFolder: string;
}

/**
 * Produce signed params for one logo upload, pinned to a business's folder.
 *
 * `asset_folder` is part of the signed string, so the browser cannot
 * re-point the upload at another business's folder — Cloudinary rejects a
 * signature that doesn't cover the params actually sent.
 */
export function signLogoUpload(businessId: string): SignedUpload {
  const { cloudName, apiKey, apiSecret } = config();
  const timestamp = Math.floor(Date.now() / 1000);
  const assetFolder = `astrabill/${businessId}/logos`;

  // The SDK signs exactly the params passed (sorted, joined, secret
  // appended, hashed) — matching what the browser must send.
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, asset_folder: assetFolder },
    apiSecret,
  );

  return { cloudName, apiKey, timestamp, signature, assetFolder };
}

/**
 * Produce signed params for one user-avatar upload, pinned to the caller's
 * own folder. Avatars are user-scoped (not business-scoped) — the display
 * name + avatar in `users` are global across every business the user belongs
 * to. The signed `asset_folder` keeps a malicious browser from re-pointing
 * the upload at another user's folder.
 */
export function signUserAvatarUpload(userId: string): SignedUpload {
  const { cloudName, apiKey, apiSecret } = config();
  const timestamp = Math.floor(Date.now() / 1000);
  const assetFolder = `astrabill/users/${userId}/avatar`;

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, asset_folder: assetFolder },
    apiSecret,
  );

  return { cloudName, apiKey, timestamp, signature, assetFolder };
}

/**
 * True only for an HTTPS delivery URL on *our* Cloudinary cloud. The branding
 * PATCH validates `logo_url` against this so the invoice renderer is never
 * pointed at an attacker-controlled host.
 */
export function isOurCloudinaryUrl(url: string): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === "res.cloudinary.com" &&
    parsed.pathname.startsWith(`/${cloudName}/`)
  );
}
