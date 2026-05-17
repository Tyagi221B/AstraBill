/**
 * Phone number normalisation — Indian SME context.
 *
 * Stored form (and what we pass to Meta / Redis keys): E.164, e.g. "+919876543210".
 * Accepted user inputs: 10-digit, with/without +91, with/without leading 0.
 */
import { ValidationError } from "./errors";

/** Normalise a user-entered Indian phone to E.164 ("+919876543210"). */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+${digits.slice(1)}`;
  throw new ValidationError(
    "Enter a valid 10-digit Indian phone number",
    { field: "phone", received: input },
  );
}

/** Strip the leading "+" for APIs that want just digits (e.g. Meta Cloud API). */
export function toMetaPhone(e164: string): string {
  return e164.startsWith("+") ? e164.slice(1) : e164;
}
