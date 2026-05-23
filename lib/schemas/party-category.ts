/**
 * Zod schemas for party category routes.
 *
 * Workspace-scoped — every category belongs to one business. Unique by name
 * per (business, deleted_at IS NULL) — enforced by the partial UQ on the
 * `party_categories` table.
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

export const createPartyCategorySchema = z.object({
  businessId: z.string().uuid(),
  name: trimmedNonEmpty(80, "Category name"),
});
export type CreatePartyCategoryInput = z.infer<
  typeof createPartyCategorySchema
>;

export const updatePartyCategorySchema = z.object({
  name: trimmedNonEmpty(80, "Category name"),
});
export type UpdatePartyCategoryInput = z.infer<
  typeof updatePartyCategorySchema
>;

export const listPartyCategoriesQuerySchema = z.object({
  businessId: z.string().uuid(),
});
export type ListPartyCategoriesQuery = z.infer<
  typeof listPartyCategoriesQuerySchema
>;
