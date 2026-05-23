/**
 * Zod schemas for the party custom-field definitions + values surface.
 *
 * Definitions = per-business named fields (Birthday, Drug License No, …)
 * that the owner configures once in Party Settings. Values = per-party
 * text payload for each definition.
 *
 * V1 scope: text fields only. A future V1.5 may grow typed fields
 * (number, date, dropdown). The TS-side `CustomFieldValueInput` carries
 * (definitionId, value: string|null) so a richer shape can be added
 * later without a migration.
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

// --- Definitions ---------------------------------------------------------

export const createPartyCustomFieldDefSchema = z.object({
  businessId: z.string().uuid(),
  name: trimmedNonEmpty(60, "Field name"),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export type CreatePartyCustomFieldDefInput = z.infer<
  typeof createPartyCustomFieldDefSchema
>;

export const updatePartyCustomFieldDefSchema = z.object({
  name: trimmedNonEmpty(60, "Field name").optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export type UpdatePartyCustomFieldDefInput = z.infer<
  typeof updatePartyCustomFieldDefSchema
>;

export const listPartyCustomFieldDefsQuerySchema = z.object({
  businessId: z.string().uuid(),
});

// --- Values (used inside party create / update payloads) -----------------

/**
 * A single (definitionId, value) tuple. `value` is nullable so the owner
 * can clear a field; we soft-treat null-or-empty as "no value" on read.
 */
export const partyCustomFieldValueSchema = z.object({
  definitionId: z.string().uuid(),
  value: z.string().max(500).nullable(),
});
export type PartyCustomFieldValueInput = z.infer<
  typeof partyCustomFieldValueSchema
>;
