/**
 * Zod schemas — the API boundary for /api/users/me.
 *
 * Editable fields:
 *   - `name`        — display name (required, 1–120 chars)
 *   - `imageOverride` — user-uploaded avatar URL (Cloudinary). Pass `null` to
 *                       clear the override and fall back to the OAuth picture.
 *
 * Email + the underlying OAuth `image` come from the sign-in provider on each
 * sign-in and are not editable here.
 *
 * `.partial()` so any subset of fields is a valid PATCH (name-only, image-only,
 * or both).
 */
import { z } from "zod";

export const updateUserProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    imageOverride: z.union([z.string().url(), z.null()]),
  })
  .partial();
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
