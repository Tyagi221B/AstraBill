/**
 * Seed lists for the Manage Business profile form — kept stable so the values
 * stored in `businesses.business_type` / `industry_type` /
 * `business_registration_type` can be compared across rows (analytics,
 * filters). The text is what gets written to the DB; the label is what the
 * user sees in the dropdown.
 *
 * All three lists are `text` columns + Zod-validated to one of these values
 * — adding a new option does NOT require a migration.
 */

/** Multi-select. Mirrors myBillBook's "Business Type" chip set; one shop can
 *  be more than one (retailer + wholesaler is the common case). */
export const BUSINESS_TYPES = [
  "retailer",
  "wholesaler",
  "distributor",
  "manufacturer",
  "service_provider",
  "trader",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  retailer: "Retailer",
  wholesaler: "Wholesaler",
  distributor: "Distributor",
  manufacturer: "Manufacturer",
  service_provider: "Service Provider",
  trader: "Trader",
};

/** Single-select. A coarse industry tag — drives GSTR-1 default classifications
 *  and onboarding template choices. Free-form text in the DB so this list can
 *  grow without a migration. */
export const INDUSTRY_TYPES = [
  "hardware",
  "electronics",
  "garments_textile",
  "grocery_kirana",
  "medical_pharma",
  "stationery",
  "footwear",
  "jewellery",
  "automotive_parts",
  "furniture",
  "construction_materials",
  "agriculture",
  "food_beverage",
  "restaurant_cafe",
  "salon_beauty",
  "professional_services",
  "it_software",
  "logistics_transport",
  "education_coaching",
  "other",
] as const;
export type IndustryType = (typeof INDUSTRY_TYPES)[number];

export const INDUSTRY_TYPE_LABELS: Record<IndustryType, string> = {
  hardware: "Hardware",
  electronics: "Electronics",
  garments_textile: "Garments & Textiles",
  grocery_kirana: "Grocery / Kirana",
  medical_pharma: "Medical / Pharma",
  stationery: "Stationery",
  footwear: "Footwear",
  jewellery: "Jewellery",
  automotive_parts: "Automotive Parts",
  furniture: "Furniture",
  construction_materials: "Construction Materials",
  agriculture: "Agriculture",
  food_beverage: "Food & Beverage",
  restaurant_cafe: "Restaurant / Cafe",
  salon_beauty: "Salon / Beauty",
  professional_services: "Professional Services",
  it_software: "IT / Software",
  logistics_transport: "Logistics / Transport",
  education_coaching: "Education / Coaching",
  other: "Other",
};

/** Single-select. Maps to Indian company registration types as recognised by
 *  the MCA — drives certain doc footnotes (LLP / Pvt Ltd must disclose CIN). */
export const BUSINESS_REGISTRATION_TYPES = [
  "sole_proprietorship",
  "partnership",
  "llp",
  "opc",
  "private_ltd",
  "public_ltd",
  "section_8",
  "other",
] as const;
export type BusinessRegistrationType =
  (typeof BUSINESS_REGISTRATION_TYPES)[number];

export const BUSINESS_REGISTRATION_TYPE_LABELS: Record<
  BusinessRegistrationType,
  string
> = {
  sole_proprietorship: "Sole Proprietorship",
  partnership: "Partnership",
  llp: "Limited Liability Partnership (LLP)",
  opc: "One Person Company (OPC)",
  private_ltd: "Private Limited Company",
  public_ltd: "Public Limited Company",
  section_8: "Section 8 / Not-for-Profit",
  other: "Other",
};

/** Signature rendering mode — what the invoice PDF draws in the signature
 *  block. `uploaded` → renders `signatureUrl`; `empty_box` → renders a
 *  dotted box for hand-signing post-print. */
export const SIGNATURE_MODES = ["uploaded", "empty_box"] as const;
export type SignatureMode = (typeof SIGNATURE_MODES)[number];
