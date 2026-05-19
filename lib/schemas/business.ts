/**
 * Zod schemas — the API boundary for business routes.
 * Onboarding accepts the minimum required to make a usable invoice later;
 * everything else (GSTIN, address, bank details) is filled in over time.
 */
import { z } from "zod";

/** 2-digit GST state code, e.g. "07" (Delhi), "29" (Karnataka). */
const stateCode = z.string().regex(/^\d{2}$/, "GST state code is 2 digits");

/** 15-character alphanumeric GSTIN. Validated only when present —
 *  unregistered shops legitimately don't have one. */
const gstin = z
  .string()
  .regex(/^[0-9A-Z]{15}$/, "GSTIN is 15 alphanumeric characters (uppercase)");

/** 6-digit Indian PIN code. */
const pincode = z.string().regex(/^\d{6}$/, "Pincode is 6 digits");

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

export const createBusinessSchema = z.object({
  // The only required field. Display name on every invoice the shop sends.
  name: trimmedNonEmpty(200, "Business name"),

  // Encouraged at onboarding (drives intrastate vs interstate GST math) but
  // optional — the user can finish their profile before the first invoice.
  stateCode: stateCode.nullable().optional(),

  // Optional everywhere — unregistered shops bill without a GSTIN.
  gstin: gstin.nullable().optional(),

  // Contact + address — all optional at create; surfaced in profile later.
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  pincode: pincode.nullable().optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

// ---- branding (Phase 2C) -----------------------------------------------

/** 6-digit hex colour, e.g. #2563eb. */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Brand colour must be a 6-digit hex like #2563eb");

/** Line-items column visibility — all seven flags required as a set. */
const invoiceColumns = z.object({
  hsn: z.boolean(),
  batch: z.boolean(),
  mfg: z.boolean(),
  exp: z.boolean(),
  discount: z.boolean(),
  tax: z.boolean(),
  secondaryQty: z.boolean(),
});

/**
 * Branding patch — every field optional, but at least one must be present.
 * `logoUrl` is deliberately NOT here: it lands in Stage 4 with the Cloudinary
 * host whitelist, so the endpoint never accepts an arbitrary image URL.
 */
export const updateBrandingSchema = z
  .object({
    brandColor: hexColor,
    brandFont: z.enum(["inter", "poppins", "noto_serif", "noto_sans"]),
    invoiceTemplateId: z.enum(["modern", "classic"]),
    invoiceSettings: z.object({ columns: invoiceColumns }),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Provide at least one branding field to update",
  });

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
