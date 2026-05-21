/**
 * Zod schemas for item category routes.
 *
 * Workspace-scoped — every category belongs to one business. Unique by name
 * per (business, deleted_at IS NULL) — enforced by partial UQ in the DB
 * schema.
 */
import { z } from "zod";

const trimmedNonEmpty = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

export const createItemCategorySchema = z.object({
  businessId: z.string().uuid(),
  name: trimmedNonEmpty(80, "Category name"),
});
export type CreateItemCategoryInput = z.infer<typeof createItemCategorySchema>;

export const listItemCategoriesQuerySchema = z.object({
  businessId: z.string().uuid(),
});
export type ListItemCategoriesQuery = z.infer<
  typeof listItemCategoriesQuerySchema
>;
