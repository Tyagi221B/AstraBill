/**
 * OTP service — request, send, verify. All state lives in Redis (5-min TTL,
 * SHA-256-HMAC hash, single-use). There is no `otp_codes` table.
 *
 * Three Redis keys per phone:
 *   otp:hash:{phone}      — HMAC of the active code, 5-min TTL, deleted on verify
 *   otp:attempts:{phone}  — failed verifies in the current 10-min window
 *   otp:requests:{phone}  — request rate-limit counter, 10-min window
 */
import "server-only";
import { createHmac, randomInt } from "node:crypto";

import { RateLimitError } from "./errors";
import { redis } from "./redis";
import { whatsapp } from "./whatsapp";

const TEMPLATE_NAME = "astrabill_otp_v1";

const OTP_TTL_SECONDS = 5 * 60;
const ATTEMPTS_TTL_SECONDS = 10 * 60;
const MAX_VERIFY_ATTEMPTS = 5;
const REQUESTS_TTL_SECONDS = 10 * 60;
const MAX_REQUESTS = 5;

function hashOtp(phone: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — required to hash OTPs");
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

/** 6-digit, never starts with 0 — `randomInt(100000, 1000000)` covers exactly. */
function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Generate an OTP, store its hash in Redis, send it via WhatsApp.
 * Rate-limited to 5 requests per phone per 10 minutes.
 */
export async function requestOtp(phone: string): Promise<void> {
  const reqKey = `otp:requests:${phone}`;
  const requests = await redis.incr(reqKey);
  if (requests === 1) await redis.expire(reqKey, REQUESTS_TTL_SECONDS);
  if (requests > MAX_REQUESTS) {
    throw new RateLimitError(
      "Too many OTP requests for this number. Try again in 10 minutes.",
    );
  }

  const code = generateOtp();
  const hash = hashOtp(phone, code);
  await redis.set(`otp:hash:${phone}`, hash, { ex: OTP_TTL_SECONDS });
  // A new code resets the verify-attempts budget — the prior code is voided.
  await redis.del(`otp:attempts:${phone}`);

  await whatsapp.sendTemplate({
    to: phone,
    template: TEMPLATE_NAME,
    bodyVars: [{ type: "text", text: code }],
    buttonVars: [{ index: 0, parameters: [{ type: "text", text: code }] }],
  });
}

/**
 * Verify a submitted code. Returns `true` on success (and consumes the code).
 * After `MAX_VERIFY_ATTEMPTS` failures the active code is invalidated.
 */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const attemptsKey = `otp:attempts:${phone}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, ATTEMPTS_TTL_SECONDS);
  if (attempts > MAX_VERIFY_ATTEMPTS) {
    await redis.del(`otp:hash:${phone}`);
    throw new RateLimitError("Too many attempts. Request a new code.");
  }

  const stored = await redis.get<string>(`otp:hash:${phone}`);
  if (!stored) return false;

  const submitted = hashOtp(phone, code);
  if (stored !== submitted) return false;

  // Single-use — kill the hash and the attempts counter together.
  await redis.del(`otp:hash:${phone}`);
  await redis.del(attemptsKey);
  return true;
}
