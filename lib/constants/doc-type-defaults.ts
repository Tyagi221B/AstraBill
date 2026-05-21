/**
 * Per-doc-type default T&C strings seeded onto `businesses.doc_type_defaults`
 * at business creation. The string `[CITY]` is a placeholder — the render
 * layer (PDF + share page) substitutes it with `businesses.city`, so the
 * placeholder never leaks onto a printed invoice the way myBillBook's
 * `[ENTER_YOUR_CITY_NAME]` does.
 *
 * Owners can edit per-business (Settings → Invoice Settings) or per-document
 * (override on `documents.terms_conditions`).
 */
import type { DocTypeDefaults } from "@/lib/db/schema";

export const SEEDED_DOC_TYPE_DEFAULTS: DocTypeDefaults = {
  sales_invoice: {
    termsConditions:
      "1. Goods once sold will not be taken back or exchanged.\n2. All disputes are subject to [CITY] jurisdiction only.",
  },
  estimate: {
    termsConditions:
      "This estimate is valid for 30 days from the date of issue. Prices are subject to change after this period.",
  },
  delivery_challan: {
    termsConditions: "",
  },
  credit_note: {
    termsConditions: "",
  },
  purchase_invoice: {
    termsConditions: "",
  },
  debit_note: {
    termsConditions: "",
  },
  quotation: {
    termsConditions:
      "This quotation is valid for 30 days from the date of issue. Prices are subject to change after this period.",
  },
  proforma_invoice: {
    termsConditions: "",
  },
};

/**
 * Substitute the `[CITY]` placeholder with the business's actual city.
 * Called at the render edge — never mutates the stored value.
 */
export function applyCityPlaceholder(
  termsConditions: string | null | undefined,
  city: string | null | undefined,
): string {
  if (!termsConditions) return "";
  if (!city) return termsConditions;
  return termsConditions.replaceAll("[CITY]", city);
}
