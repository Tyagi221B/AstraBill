/**
 * Zod schemas — the API boundary for /api/users/me.
 * V1: name is the only editable field. Email + image flow from the OAuth
 * provider (Google) and are not editable here.
 */
import { z } from "zod";

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
