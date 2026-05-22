/**
 * Zod schemas for the document_counters seed route (onboarding wizard).
 *
 * Owner can pre-set the starting sequence for each doc type for the current
 * FY — typically used by a mid-year onboarder who's already issued some
 * paper invoices. e.g. "I've issued 47 INV/26-27/NNN so far, start at 48."
 */
import { z } from "zod";

import { docTypeSchema } from "./document";

const positiveInt = z.coerce.number().int().min(1).max(9_999_999);

export const seedDocumentCounterSchema = z.object({
  docType: docTypeSchema,
  startSequence: positiveInt,
  prefix: z.string().trim().max(20).optional(),
  sequenceTemplate: z.string().trim().max(80).optional(),
  resetEachFy: z.boolean().optional(),
});
export type SeedDocumentCounterInput = z.infer<
  typeof seedDocumentCounterSchema
>;

export const seedDocumentCountersRequestSchema = z.object({
  businessId: z.string().uuid(),
  seeds: z.array(seedDocumentCounterSchema).min(1),
});
export type SeedDocumentCountersRequest = z.infer<
  typeof seedDocumentCountersRequestSchema
>;
