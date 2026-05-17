/**
 * POST /api/otp/request — { phone } → sends a 6-digit OTP via WhatsApp.
 *
 * The verify step happens inside NextAuth's Credentials provider
 * (`signIn("credentials", { phone, code })`) — see lib/auth.ts. There is
 * deliberately no separate /api/otp/verify endpoint.
 */
import { z } from "zod";

import { ok, parseJson, route } from "@/lib/http";
import { requestOtp } from "@/lib/otp";
import { normalizePhone } from "@/lib/phone";

const RequestSchema = z.object({
  phone: z.string().min(10).max(20),
});

export const POST = route(async (req) => {
  const { phone } = await parseJson(req, RequestSchema);
  const normalized = normalizePhone(phone);
  await requestOtp(normalized);
  return ok({ sent: true });
});
