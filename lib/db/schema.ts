/**
 * AstraBill — database schema (single source of truth for data shape).
 *
 * PR1 of the full-ledger pivot (2026-05-21).
 *
 * Layout:
 *   1. Shared helpers + auth + businesses + audit
 *   2. LEGACY tables — customers / products / invoices / invoice_line_items /
 *      payments / stock_movements. Untouched by PR1; demolished by PR2 once the
 *      new domain layer ships.
 *   3. NEW domain — parties / items / money_accounts / documents /
 *      document_line_items / document_additional_charges / document_counters /
 *      payment_entries / payment_entry_allocations / ledger_entries /
 *      item_stock_movements (renamed to `stock_movements` in PR2).
 *
 * Conventions:
 * - Money is `NUMERIC(12,2)` — never float. Quantities are `NUMERIC(12,3)`
 *   (fractional units: kg, sq.ft.). GST rates are `NUMERIC(5,2)`.
 * - GST rate semantics on items/lines: `gst_rate IS NULL` ⇒ legally exempted;
 *   `gst_rate = 0.00` ⇒ nil-rated (0%). Both are distinct under Indian GST.
 * - Instants are `timestamptz` (UTC). Calendar dates (issue/due) are `date`.
 * - Every business table carries `business_id` — tenant isolation is enforced
 *   by query scoping in the repository layer (no RLS). See database-and-rbac.
 * - Mutable business tables carry `deleted_at` (soft delete).
 * - DB-level CHECK constraints are used only for load-bearing invariants
 *   that would corrupt the ledger if violated (see ledger_entries,
 *   payment_entries, documents). Everything else is service-layer enforced.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// =========================================================================
// Column helpers
// =========================================================================

/** Money — exact, 2 decimal places. Never use float for currency. */
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
/** Quantity — 3 decimal places for fractional units (kg, sq.ft.). */
const quantity = (name: string) => numeric(name, { precision: 12, scale: 3 });
/** GST rate as a percentage, e.g. 18.00. Nullable on items/lines = exempted. */
const rate = (name: string) => numeric(name, { precision: 5, scale: 2 });

/** created_at / updated_at, both UTC instants. */
const lifecycle = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

/** Soft delete marker — repositories filter `deleted_at IS NULL` by default. */
const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

// =========================================================================
// Enums — existing
// =========================================================================

export const memberRole = pgEnum("member_role", [
  "owner",
  "admin",
  "accountant",
  "salesman",
  "viewer",
]);

export const planTier = pgEnum("plan_tier", [
  "free",
  "starter",
  "pro",
  "business",
]);

/** LEGACY — drives `invoices.type`. PR2 drops the column and this enum. */
export const invoiceType = pgEnum("invoice_type", [
  "tax_invoice",
  "estimate",
  "cash_receipt",
  "credit_note",
  "debit_note",
  "delivery_challan",
]);

/** LEGACY — drives `invoices.status`. PR2 drops the column and this enum. */
export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "seen",
  "partially_paid",
  "paid",
  "overdue",
]);

/** LEGACY — `products.unit` and `invoice_line_items.unit`. PR2 drops these. */
export const unit = pgEnum("unit", [
  "sqft",
  "kg",
  "pcs",
  "linear_ft",
  "box",
  "dozen",
  "sqm",
  "set",
]);

export const paymentMethod = pgEnum("payment_method", [
  "upi",
  "cash",
  "bank_transfer",
  "card",
  "cheque",
  "other",
]);

/** LEGACY — drives the old product-bound `stock_movements.type`. */
export const stockMovementType = pgEnum("stock_movement_type", ["in", "out"]);

export const whatsappStatus = pgEnum("whatsapp_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);

// =========================================================================
// Enums — new (full-ledger pivot)
// =========================================================================

export const partyType = pgEnum("party_type", ["customer", "supplier"]);

export const partyAddressKind = pgEnum("party_address_kind", [
  "billing",
  "shipping",
]);

export const itemType = pgEnum("item_type", ["product", "service"]);

export const moneyAccountType = pgEnum("money_account_type", ["cash", "bank"]);

export const docType = pgEnum("doc_type", [
  "sales_invoice",
  "estimate",
  "delivery_challan",
  "credit_note",
  "purchase_invoice",
  "debit_note",
  "quotation",
  "proforma_invoice",
]);

export const docStatus = pgEnum("doc_status", [
  "draft",
  "unpaid",
  "partial_paid",
  "paid",
  "cancelled",
]);

export const paymentEntryType = pgEnum("payment_entry_type", [
  "payment_in",
  "payment_out",
]);

export const paymentEntryStatus = pgEnum("payment_entry_status", [
  "recorded",
  "cancelled",
]);

/**
 * The narrow set of operations that produce a `ledger_entries` row.
 * Voucher type pairs with the FK columns (party_id / money_account_id /
 * document_id / payment_entry_id) to fully describe the row's origin.
 */
export const voucherType = pgEnum("voucher_type", [
  "opening_balance",
  "sales_invoice",
  "purchase_invoice",
  "credit_note",
  "debit_note",
  "payment_in",
  "payment_out",
  "settlement_discount",
  "manual_adjustment",
  "transfer_in",
  "transfer_out",
  "bank_charges",
  "reversal",
]);

/**
 * `item_stock_movements.txn_type`. Broader than the legacy `in | out` — these
 * carry the *reason* for the stock movement so reports can group cleanly.
 */
export const stockTxnType = pgEnum("stock_txn_type", [
  "opening_stock",
  "sale",
  "purchase",
  "manual_adjustment",
  "sales_return",
  "purchase_return",
  "transfer_in",
  "transfer_out",
]);

// =========================================================================
// users — unchanged
// =========================================================================

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  phone: text("phone").unique(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  ...lifecycle,
  ...softDelete,
});

// =========================================================================
// accounts (NextAuth — Google OAuth) — unchanged
// =========================================================================

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// =========================================================================
// businesses — EXTENDED additively for full-ledger pivot
// =========================================================================

/**
 * Per-business invoice display settings — line-items column visibility.
 * Carries the 2C.5 column toggles. Defaults shown / hidden tuned for the
 * general trading shop (pharma columns batch / MFG / EXP off by default).
 */
export type InvoiceSettings = {
  columns: {
    hsn: boolean;
    batch: boolean;
    mfg: boolean;
    exp: boolean;
    discount: boolean;
    tax: boolean;
    secondaryQty: boolean;
  };
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  columns: {
    hsn: true,
    batch: false,
    mfg: false,
    exp: false,
    discount: true,
    tax: true,
    secondaryQty: true,
  },
};

/**
 * Per-doc-type defaults — currently the seeded T&C string. Editable per
 * business; per-document override lives on `documents.terms_conditions`.
 * Stored as jsonb so adding a new doc type or a new per-type default
 * doesn't require a migration.
 */
export type DocTypeDefaults = Partial<
  Record<
    (typeof docType.enumValues)[number],
    {
      termsConditions?: string;
    }
  >
>;

export const businesses = pgTable("businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  gstin: text("gstin"), // 15-char GSTIN; null for unregistered shops
  // NEW: PAN is captured separately from GSTIN (a non-GST business has no
  // GSTIN but may still have a PAN; e-Invoicing also needs PAN explicitly).
  panNumber: text("pan_number"),
  // NEW: GST registration master toggle — when false, GST math is suppressed
  // and only `delivery_challan` / non-tax docs are issuable.
  isGstRegistered: boolean("is_gst_registered").notNull().default(true),
  phone: text("phone"),
  email: text("email"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  stateCode: text("state_code"),
  pincode: text("pincode"),
  logoUrl: text("logo_url"),
  // LEGACY bank fields — superseded by `money_accounts` (the default bank
  // account holds these). Kept for backward compatibility with the old
  // invoice render path; PR2 will migrate readers and drop these.
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankIfsc: text("bank_ifsc"),
  bankAccountHolder: text("bank_account_holder"),
  upiId: text("upi_id"),
  // LEGACY single-default T&C — superseded by `docTypeDefaults` jsonb below.
  // Kept so old `invoices` PDF rendering doesn't break before PR2.
  invoiceTerms: text("invoice_terms"),
  invoiceNumberPrefix: text("invoice_number_prefix"),
  // --- Branding (Phase 2C, existing) ---
  brandColor: text("brand_color").notNull().default("#2563eb"),
  brandFont: text("brand_font").notNull().default("inter"),
  invoiceTemplateId: text("invoice_template_id").notNull().default("modern"),
  invoiceSettings: jsonb("invoice_settings")
    .$type<InvoiceSettings>()
    .notNull()
    .default(DEFAULT_INVOICE_SETTINGS),
  // --- NEW: Full-ledger profile fields (myBillBook parity) ---
  /**
   * Multi-select tags (retailer / wholesaler / distributor / manufacturer /
   * services). One business can be more than one. Free-form jsonb so adding
   * a new tag never needs a migration.
   */
  businessType: jsonb("business_type")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Free text from a seeded list (Hardware, Glass, Electronics, …). */
  industryType: text("industry_type"),
  /**
   * One of: sole_proprietorship, partnership, llp, opc, private_ltd,
   * public_ltd, section_8, other. Text + Zod (matches the brand_font pattern)
   * so we can add registration types without a pg enum migration.
   */
  businessRegistrationType: text("business_registration_type"),
  /** Uploaded signature image. */
  signatureUrl: text("signature_url"),
  /**
   * `uploaded` (renders signatureUrl) or `empty_box` (renders a placeholder
   * box for hand-signing post-print). Text + Zod.
   */
  signatureMode: text("signature_mode").notNull().default("empty_box"),
  /** Optional "Authorized Signatory for {name}" label override. */
  signatoryName: text("signatory_name"),
  /**
   * Free-form k=v pairs the owner wants printed on every invoice
   * (Website, MSME number, Drug License No, etc.).
   */
  additionalDetails: jsonb("additional_details")
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  /**
   * Per-doc-type defaults — seeded at business creation by the service layer
   * (sales: "Goods once sold…", purchase: empty, quotation: validity terms).
   * The `[CITY]` placeholder is substituted with `businesses.city` at render.
   */
  docTypeDefaults: jsonb("doc_type_defaults")
    .$type<DocTypeDefaults>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  /**
   * Financial year start month. Indian default is 4 (April). FY rollover on
   * 1st of this month resets document counters where `reset_each_fy = true`.
   */
  fyStartMonth: integer("fy_start_month").notNull().default(4),
  /** V2-gated UI toggles; schema present so the upgrade path is migration-free. */
  enableTds: boolean("enable_tds").notNull().default(false),
  enableTcs: boolean("enable_tcs").notNull().default(false),
  // --- Subscription ---
  plan: planTier("plan").notNull().default("free"),
  planValidUntil: date("plan_valid_until"),
  ...lifecycle,
  ...softDelete,
});

// =========================================================================
// business_members — unchanged
// =========================================================================

export const businessMembers = pgTable(
  "business_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("business_members_business_user_uq")
      .on(t.businessId, t.userId)
      .where(sql`${t.deletedAt} is null`),
    index("business_members_user_idx").on(t.userId),
  ],
);

// =========================================================================
// LEGACY — customers / products / invoices / invoice_line_items / payments /
// stock_movements. PR2 demolishes these atomically with the domain rebuild.
// Kept untouched in PR1 so the old domain continues running.
// =========================================================================

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    gstin: text("gstin"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"),
    pincode: text("pincode"),
    notes: text("notes"),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [index("customers_business_idx").on(t.businessId)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hsnCode: text("hsn_code"),
    unit: unit("unit").notNull().default("pcs"),
    gstRate: rate("gst_rate").notNull().default("0"),
    purchasePrice: money("purchase_price"),
    sellingPrice: money("selling_price").notNull(),
    stock: quantity("stock").notNull().default("0"),
    lowStockThreshold: quantity("low_stock_threshold"),
    isActive: boolean("is_active").notNull().default(true),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [index("products_business_idx").on(t.businessId)],
);

export type ExtraCharge = {
  label: string;
  amount: string;
  taxable: boolean;
  gstRate?: string;
};

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    type: invoiceType("type").notNull().default("tax_invoice"),
    number: text("number"),
    shareToken: text("share_token").unique(),
    status: invoiceStatus("status").notNull().default("draft"),
    originalInvoiceId: uuid("original_invoice_id").references(
      (): AnyPgColumn => invoices.id,
      { onDelete: "set null" },
    ),
    placeOfSupplyStateCode: text("place_of_supply_state_code"),
    subtotal: money("subtotal").notNull().default("0"),
    discountAmount: money("discount_amount").notNull().default("0"),
    taxableAmount: money("taxable_amount").notNull().default("0"),
    cgstAmount: money("cgst_amount").notNull().default("0"),
    sgstAmount: money("sgst_amount").notNull().default("0"),
    igstAmount: money("igst_amount").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    roundOff: money("round_off").notNull().default("0"),
    total: money("total").notNull().default("0"),
    amountPaid: money("amount_paid").notNull().default("0"),
    notes: text("notes"),
    shipToName: text("ship_to_name"),
    shipToAddress: text("ship_to_address"),
    extraCharges: jsonb("extra_charges")
      .$type<ExtraCharge[]>()
      .notNull()
      .default([]),
    transportMode: text("transport_mode"),
    vehicleNumber: text("vehicle_number"),
    ewayBillNumber: text("eway_bill_number"),
    issueDate: date("issue_date").notNull().defaultNow(),
    dueDate: date("due_date"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("invoices_business_number_uq")
      .on(t.businessId, t.number)
      .where(sql`${t.deletedAt} is null`),
    index("invoices_business_status_idx").on(t.businessId, t.status),
    index("invoices_customer_idx").on(t.customerId),
  ],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    hsnCode: text("hsn_code"),
    quantity: quantity("quantity").notNull(),
    unit: unit("unit").notNull(),
    secondaryQuantity: quantity("secondary_quantity"),
    secondaryUnit: unit("secondary_unit"),
    unitPrice: money("unit_price").notNull(),
    discountAmount: money("discount_amount").notNull().default("0"),
    gstRate: rate("gst_rate").notNull().default("0"),
    taxableAmount: money("taxable_amount").notNull(),
    cgstAmount: money("cgst_amount").notNull().default("0"),
    sgstAmount: money("sgst_amount").notNull().default("0"),
    igstAmount: money("igst_amount").notNull().default("0"),
    amount: money("amount").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: lifecycle.createdAt,
  },
  (t) => [index("invoice_line_items_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    method: paymentMethod("method").notNull(),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpayOrderId: text("razorpay_order_id"),
    reference: text("reference"),
    notes: text("notes"),
    paidAt: timestamp("paid_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_razorpay_payment_idx").on(t.razorpayPaymentId),
  ],
);

/**
 * LEGACY product-bound stock ledger. Renamed and replaced by
 * `item_stock_movements` in PR1; PR2 atomically drops this table and renames
 * `item_stock_movements` → `stock_movements`.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: stockMovementType("type").notNull(),
    quantity: quantity("quantity").notNull(),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: lifecycle.createdAt,
  },
  (t) => [
    index("stock_movements_product_idx").on(t.productId),
    index("stock_movements_invoice_idx").on(t.invoiceId),
  ],
);

// =========================================================================
// whatsapp_messages — unchanged (used by both old + new domains)
// =========================================================================

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "cascade",
    }),
    toPhone: text("to_phone").notNull(),
    templateName: text("template_name").notNull(),
    messageId: text("message_id"),
    status: whatsappStatus("status").notNull().default("queued"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...lifecycle,
  },
  (t) => [
    index("whatsapp_messages_invoice_idx").on(t.invoiceId),
    index("whatsapp_messages_message_idx").on(t.messageId),
  ],
);

// =========================================================================
// audit_log — unchanged
// =========================================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    changes: jsonb("changes"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: lifecycle.createdAt,
  },
  (t) => [
    index("audit_log_business_created_idx").on(t.businessId, t.createdAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

// =========================================================================
// NEW — party_categories
// =========================================================================

export const partyCategories = pgTable(
  "party_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("party_categories_business_name_uq")
      .on(t.businessId, t.name)
      .where(sql`${t.deletedAt} is null`),
    index("party_categories_business_idx").on(t.businessId),
  ],
);

// =========================================================================
// NEW — parties (replaces `customers`; adds suppliers)
//
// Opening balance is NOT a column here — it's stored as a `ledger_entries`
// row with `voucher_type = 'opening_balance'`. This matches the myBillBook
// CSV-confirmed model and keeps the ledger as the single source of truth
// for any party's balance.
// =========================================================================

export const parties = pgTable(
  "parties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    /**
     * Pure UI metadata — drives the default primary CTA on the party detail
     * page ("Create Sales Invoice" vs "Create Purchase Invoice") and the
     * sidebar grouping. Ledger / receivable / payable surfaces are computed
     * from `ledger_entries` balance sign, never from `type`.
     */
    type: partyType("type").notNull(),
    name: text("name").notNull(),
    mobileNumber: text("mobile_number"),
    email: text("email"),
    /** Soft-warn-only — no UNIQUE constraint (see decision/full-ledger-pivot D2). */
    gstin: text("gstin"),
    panNumber: text("pan_number"),
    categoryId: uuid("category_id").references(() => partyCategories.id, {
      onDelete: "set null",
    }),
    creditPeriodDays: integer("credit_period_days").notNull().default(30),
    creditLimit: money("credit_limit").notNull().default("0"),
    /**
     * Quick-access contact fields. Multiple contact persons get their own
     * rows in `party_contact_persons`; these are the convenience defaults
     * shown on the party card.
     */
    contactPersonName: text("contact_person_name"),
    contactPersonDob: date("contact_person_dob"),
    notes: text("notes"),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    index("parties_business_idx").on(t.businessId),
    index("parties_business_type_idx").on(t.businessId, t.type),
    index("parties_business_mobile_idx").on(t.businessId, t.mobileNumber),
    index("parties_business_gstin_idx").on(t.businessId, t.gstin),
    index("parties_category_idx").on(t.categoryId),
  ],
);

// =========================================================================
// NEW — party_addresses
//
// One billing address (enforced by partial UQ), many shipping addresses.
// =========================================================================

export const partyAddresses = pgTable(
  "party_addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    kind: partyAddressKind("kind").notNull(),
    label: text("label"),
    streetAddress: text("street_address"),
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"),
    pincode: text("pincode"),
    isDefault: boolean("is_default").notNull().default(false),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    index("party_addresses_party_idx").on(t.partyId),
    uniqueIndex("party_addresses_one_billing_uq")
      .on(t.partyId)
      .where(sql`${t.kind} = 'billing' and ${t.deletedAt} is null`),
  ],
);

// =========================================================================
// NEW — party_bank_accounts
//
// AstraBill allows MULTIPLE bank accounts per party (deviation D1 from
// myBillBook). One can be marked default.
// =========================================================================

export const partyBankAccounts = pgTable(
  "party_bank_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    bankAccountNumber: text("bank_account_number").notNull(),
    ifsc: text("ifsc"),
    accountHolderName: text("account_holder_name"),
    bankName: text("bank_name"),
    branchName: text("branch_name"),
    upiId: text("upi_id"),
    isDefault: boolean("is_default").notNull().default(false),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [index("party_bank_accounts_party_idx").on(t.partyId)],
);

// =========================================================================
// NEW — party_contact_persons
// =========================================================================

export const partyContactPersons = pgTable(
  "party_contact_persons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    designation: text("designation"),
    phone: text("phone"),
    email: text("email"),
    dob: date("dob"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [index("party_contact_persons_party_idx").on(t.partyId)],
);

// =========================================================================
// NEW — party_custom_field_definitions / party_custom_field_values
//
// Workspace-level field definitions, per-party values. Mirrors myBillBook's
// shape — name-only (no type selector); values are free text.
// =========================================================================

export const partyCustomFieldDefinitions = pgTable(
  "party_custom_field_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("party_cfd_business_name_uq")
      .on(t.businessId, t.name)
      .where(sql`${t.deletedAt} is null`),
    index("party_cfd_business_idx").on(t.businessId),
  ],
);

export const partyCustomFieldValues = pgTable(
  "party_custom_field_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => partyCustomFieldDefinitions.id, {
        onDelete: "cascade",
      }),
    value: text("value"),
    ...lifecycle,
  },
  (t) => [
    uniqueIndex("party_cfv_party_def_uq").on(t.partyId, t.definitionId),
    index("party_cfv_party_idx").on(t.partyId),
  ],
);

// =========================================================================
// NEW — item_units (seeded reference table)
//
// `code` is the PK so line items can carry the unit code as a snapshot
// without a FK lookup. System rows have `is_system = true` and
// `business_id IS NULL`; workspace-added custom units carry a business_id.
// =========================================================================

export const itemUnits = pgTable(
  "item_units",
  {
    code: text("code").primaryKey(),
    displayName: text("display_name").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    createdAt: lifecycle.createdAt,
  },
  (t) => [index("item_units_business_idx").on(t.businessId)],
);

// =========================================================================
// NEW — item_categories
// =========================================================================

export const itemCategories = pgTable(
  "item_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("item_categories_business_name_uq")
      .on(t.businessId, t.name)
      .where(sql`${t.deletedAt} is null`),
    index("item_categories_business_idx").on(t.businessId),
  ],
);

// =========================================================================
// NEW — items (replaces `products`; adds services)
//
// GST rate semantics:
//   gst_rate IS NULL  ⇒ legally EXEMPTED (won't appear as taxable in returns)
//   gst_rate = 0.00   ⇒ nil-rated 0% (appears at zero in GSTR-1)
//   gst_rate > 0      ⇒ regular taxable
// =========================================================================

export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    type: itemType("type").notNull().default("product"),
    name: text("name").notNull(),
    categoryId: uuid("category_id").references(() => itemCategories.id, {
      onDelete: "set null",
    }),
    /** Item code (products) or service code (services). */
    code: text("code"),
    /** HSN for products, SAC for services. */
    hsnSacCode: text("hsn_sac_code"),
    /** Rate-bearing unit. FK by code, snapshotted onto line items. */
    measuringUnitCode: text("measuring_unit_code").references(
      () => itemUnits.code,
      { onDelete: "restrict" },
    ),
    /** Optional secondary unit for dual-unit billing (e.g. glass: sqm + pcs). */
    alternativeUnitCode: text("alternative_unit_code").references(
      () => itemUnits.code,
      { onDelete: "set null" },
    ),
    // --- pricing ---
    salesPrice: money("sales_price"),
    salesPriceIncludesTax: boolean("sales_price_includes_tax")
      .notNull()
      .default(false),
    purchasePrice: money("purchase_price"),
    purchasePriceIncludesTax: boolean("purchase_price_includes_tax")
      .notNull()
      .default(false),
    /** Null = exempted; 0 = nil-rated; > 0 = taxable. */
    gstRate: rate("gst_rate"),
    discountOnSalesPricePercent: rate("discount_on_sales_price_percent"),
    // --- stock (products only) ---
    openingStock: quantity("opening_stock"),
    openingStockAsOfDate: date("opening_stock_as_of_date"),
    enableLowStockWarning: boolean("enable_low_stock_warning")
      .notNull()
      .default(false),
    lowStockThreshold: quantity("low_stock_threshold"),
    // --- presentation ---
    description: text("description"),
    images: jsonb("images")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    showInOnlineStore: boolean("show_in_online_store")
      .notNull()
      .default(false),
    isActive: boolean("is_active").notNull().default(true),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    index("items_business_idx").on(t.businessId),
    index("items_business_category_idx").on(t.businessId, t.categoryId),
    index("items_business_type_idx").on(t.businessId, t.type),
  ],
);

// =========================================================================
// NEW — item_party_prices
//
// Per-party price override. Schema in V1, UI in V1.5.
// =========================================================================

export const itemPartyPrices = pgTable(
  "item_party_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    salesPrice: money("sales_price"),
    purchasePrice: money("purchase_price"),
    ...lifecycle,
  },
  (t) => [
    uniqueIndex("item_party_prices_item_party_uq").on(t.itemId, t.partyId),
    index("item_party_prices_party_idx").on(t.partyId),
  ],
);

// =========================================================================
// NEW — item_custom_field_definitions / item_custom_field_values
// =========================================================================

export const itemCustomFieldDefinitions = pgTable(
  "item_custom_field_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("item_cfd_business_name_uq")
      .on(t.businessId, t.name)
      .where(sql`${t.deletedAt} is null`),
    index("item_cfd_business_idx").on(t.businessId),
  ],
);

export const itemCustomFieldValues = pgTable(
  "item_custom_field_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => itemCustomFieldDefinitions.id, {
        onDelete: "cascade",
      }),
    value: text("value"),
    ...lifecycle,
  },
  (t) => [
    uniqueIndex("item_cfv_item_def_uq").on(t.itemId, t.definitionId),
    index("item_cfv_item_idx").on(t.itemId),
  ],
);

// =========================================================================
// NEW — money_accounts (cash drawer + bank accounts)
//
// Owns the *business's own* bank accounts (where YOU receive money).
// Every payment_entry references exactly one money_account. The opening
// balance is realised as a `ledger_entries` row with
// voucher_type='opening_balance' and money_account_id populated.
// =========================================================================

export const moneyAccounts = pgTable(
  "money_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    type: moneyAccountType("type").notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    // Bank-only details — nullable on cash rows. Service-layer enforced.
    bankAccountNumber: text("bank_account_number"),
    ifsc: text("ifsc"),
    accountHolderName: text("account_holder_name"),
    bankName: text("bank_name"),
    branchName: text("branch_name"),
    upiId: text("upi_id"),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    index("money_accounts_business_idx").on(t.businessId),
    uniqueIndex("money_accounts_business_default_uq")
      .on(t.businessId, t.type)
      .where(sql`${t.isDefault} = true and ${t.deletedAt} is null`),
  ],
);

// =========================================================================
// NEW — documents
//
// One table for every doc type. `doc_type` discriminates; `payment_terms_days`
// and `due_date` double as `valid_for_days` and `validity_date` for quotations
// (app-layer label flip).
//
// `doc_number` is assigned on finalise (status: draft → unpaid), not at
// create. The FY used for the counter is derived from `doc_date`, so
// backdated docs land in the correct historical FY.
// =========================================================================

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    docType: docType("doc_type").notNull(),
    /** Null for drafts; assigned at finalise. */
    docNumber: text("doc_number"),
    docDate: date("doc_date").notNull().defaultNow(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    /** FK into `party_addresses` — nullable if same as billing. */
    shipToAddressId: uuid("ship_to_address_id").references(
      () => partyAddresses.id,
      { onDelete: "set null" },
    ),
    /**
     * Doc-to-doc lineage:
     *   Quotation → Sales Invoice (Convert to Invoice)
     *   Sales Invoice → Credit Note (sales return)
     *   Purchase Invoice → Debit Note (purchase return)
     */
    sourceDocId: uuid("source_doc_id").references(
      (): AnyPgColumn => documents.id,
      { onDelete: "set null" },
    ),
    /** Supplier's invoice number (purchase docs only) — required for ITC. */
    originalDocNumber: text("original_doc_number"),
    /** Supplier's invoice date (purchase docs only). */
    originalDocDate: date("original_doc_date"),
    /** "Valid for X days" for quotations; "Net X" for sales/purchase. */
    paymentTermsDays: integer("payment_terms_days"),
    /** Validity date for quotations; due date for sales/purchase. */
    dueDate: date("due_date"),
    /** 2-digit GST state code — drives CGST+SGST vs IGST classification. */
    placeOfSupplyStateCode: text("place_of_supply_state_code"),
    /** Per-doc override of `businesses.signature_url`. */
    signatureUrl: text("signature_url"),
    /** Per-doc override of `businesses.doc_type_defaults[docType].termsConditions`. */
    termsConditions: text("terms_conditions"),
    notes: text("notes"),
    currencyCode: text("currency_code").notNull().default("INR"),
    autoRoundOffEnabled: boolean("auto_round_off_enabled")
      .notNull()
      .default(false),
    // --- totals (all service-layer derived; persisted for fast reads + PDF) ---
    subtotal: money("subtotal").notNull().default("0"),
    totalLineDiscount: money("total_line_discount").notNull().default("0"),
    additionalChargesTaxable: money("additional_charges_taxable")
      .notNull()
      .default("0"),
    additionalChargesNonTaxable: money("additional_charges_non_taxable")
      .notNull()
      .default("0"),
    taxableAmount: money("taxable_amount").notNull().default("0"),
    cgstAmount: money("cgst_amount").notNull().default("0"),
    sgstAmount: money("sgst_amount").notNull().default("0"),
    igstAmount: money("igst_amount").notNull().default("0"),
    totalTaxAmount: money("total_tax_amount").notNull().default("0"),
    billLevelDiscount: money("bill_level_discount").notNull().default("0"),
    roundOff: money("round_off").notNull().default("0"),
    grandTotal: money("grand_total").notNull().default("0"),
    /** Derived from sum of non-cancelled payment_entry_allocations. */
    amountReceived: money("amount_received").notNull().default("0"),
    // --- transport / e-way ---
    transportMode: text("transport_mode"),
    vehicleNumber: text("vehicle_number"),
    ewayBillNumber: text("eway_bill_number"),
    // --- public share ---
    shareToken: text("share_token").unique(),
    // --- lifecycle ---
    status: docStatus("status").notNull().default("draft"),
    finalisedAt: timestamp("finalised_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledReason: text("cancelled_reason"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    /**
     * doc_number is unique per (business, doc_type) — the per-FY counter
     * generates numbers that include the FY token, so we don't need FY in
     * the index. NULL drafts coexist (Postgres treats NULLs as distinct).
     */
    uniqueIndex("documents_business_type_number_uq")
      .on(t.businessId, t.docType, t.docNumber)
      .where(sql`${t.deletedAt} is null`),
    index("documents_business_status_idx").on(t.businessId, t.status),
    index("documents_business_type_date_idx").on(
      t.businessId,
      t.docType,
      t.docDate,
    ),
    index("documents_party_idx").on(t.partyId),
    index("documents_source_doc_idx").on(t.sourceDocId),
    check("documents_grand_total_nonneg", sql`${t.grandTotal} >= 0`),
    check(
      "documents_finalised_has_number",
      sql`${t.status} = 'draft' or ${t.docNumber} is not null`,
    ),
  ],
);

// =========================================================================
// NEW — document_line_items
//
// Snapshots item details (name, HSN/SAC, unit) at finalise time so renaming
// or repricing the item later doesn't mutate history.
// =========================================================================

export const documentLineItems = pgTable(
  "document_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    /** Null for free-text lines (e.g. ad-hoc labour, cutting charges). */
    itemId: uuid("item_id").references(() => items.id, {
      onDelete: "set null",
    }),
    // --- snapshots ---
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    hsnSacCodeSnapshot: text("hsn_sac_code_snapshot"),
    unitCodeSnapshot: text("unit_code_snapshot"),
    description: text("description"),
    // --- quantity (rate-bearing pair) ---
    quantity: quantity("quantity").notNull(),
    /** Optional informational second unit — never enters GST math. */
    secondaryQuantity: quantity("secondary_quantity"),
    secondaryUnitCode: text("secondary_unit_code"),
    // --- pricing ---
    pricePerUnit: money("price_per_unit").notNull(),
    priceIncludesTax: boolean("price_includes_tax").notNull().default(false),
    discountPercent: rate("discount_percent"),
    discountAmount: money("discount_amount").notNull().default("0"),
    /** Null = exempted; 0 = nil-rated; > 0 = taxable. Snapshotted from item. */
    gstRate: rate("gst_rate"),
    // --- computed amounts (persisted for PDF render + reports) ---
    taxableAmount: money("taxable_amount").notNull().default("0"),
    cgstAmount: money("cgst_amount").notNull().default("0"),
    sgstAmount: money("sgst_amount").notNull().default("0"),
    igstAmount: money("igst_amount").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    /** GST-inclusive line total (matches the user-facing Amount column). */
    lineAmount: money("line_amount").notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: lifecycle.createdAt,
  },
  (t) => [
    index("document_line_items_document_idx").on(t.documentId),
    index("document_line_items_item_idx").on(t.itemId),
  ],
);

// =========================================================================
// NEW — document_additional_charges
//
// Taxable charges (cutting, hole, processing) fold into the taxable base
// pre-GST at their own `gstRate`. Non-taxable charges (informal freight,
// loading) add to the grand total post-tax.
// =========================================================================

export const documentAdditionalCharges = pgTable(
  "document_additional_charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amount: money("amount").notNull(),
    taxable: boolean("taxable").notNull().default(false),
    /** Required when `taxable = true`. Service-layer enforced. */
    gstRate: rate("gst_rate"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: lifecycle.createdAt,
  },
  (t) => [
    index("doc_additional_charges_document_idx").on(t.documentId),
    check(
      "doc_additional_charges_taxable_has_rate",
      sql`${t.taxable} = false or ${t.gstRate} is not null`,
    ),
  ],
);

// =========================================================================
// NEW — document_counters
//
// Per (business, doc_type, fy_year) row. Counts only finalised docs;
// abandoned drafts never burn a number. The service layer takes a
// `FOR UPDATE` lock on this row when assigning a number to serialise
// concurrent finalises.
// =========================================================================

export const documentCounters = pgTable(
  "document_counters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    docType: docType("doc_type").notNull(),
    /** Indian FY token, e.g. "26-27" for FY ending 31-Mar-2027. */
    fyYear: text("fy_year").notNull(),
    /** Owner-customisable prefix. e.g. "INV/", "EST-". Empty = no prefix. */
    prefix: text("prefix").notNull().default(""),
    /**
     * Token-based format string. Tokens:
     *   {PREFIX}  → `prefix` column
     *   {FY}      → fy_year (e.g. "26-27")
     *   {SEQ:N}   → zero-padded next_sequence to N digits
     * Default: "{PREFIX}{SEQ:3}".
     */
    sequenceTemplate: text("sequence_template")
      .notNull()
      .default("{PREFIX}{SEQ:3}"),
    nextSequence: integer("next_sequence").notNull().default(1),
    /** When true, auto-reset to 1 on 1st of `fyStartMonth`. */
    resetEachFy: boolean("reset_each_fy").notNull().default(true),
    ...lifecycle,
  },
  (t) => [
    uniqueIndex("document_counters_business_type_fy_uq").on(
      t.businessId,
      t.docType,
      t.fyYear,
    ),
    check("document_counters_next_seq_positive", sql`${t.nextSequence} >= 1`),
  ],
);

// =========================================================================
// NEW — payment_entries
//
// One row per recorded payment (in or out). Every payment_entry posts
// exactly two ledger_entries rows in the same transaction:
//   1. party leg   — credit on payment_in, debit on payment_out
//   2. money leg   — debit on payment_in, credit on payment_out
// Settlement discount adds a third party-side credit row (no cash moves).
// =========================================================================

export const paymentEntries = pgTable(
  "payment_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    entryType: paymentEntryType("entry_type").notNull(),
    entryDate: date("entry_date").notNull().defaultNow(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    moneyAccountId: uuid("money_account_id")
      .notNull()
      .references(() => moneyAccounts.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    /** Settlement write-off (e.g. "round off the last ₹50"). */
    discountAmount: money("discount_amount").notNull().default("0"),
    paymentMode: paymentMethod("payment_mode").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    status: paymentEntryStatus("status").notNull().default("recorded"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledReason: text("cancelled_reason"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [
    index("payment_entries_business_idx").on(t.businessId),
    index("payment_entries_party_idx").on(t.partyId),
    index("payment_entries_money_account_idx").on(t.moneyAccountId),
    index("payment_entries_business_date_idx").on(t.businessId, t.entryDate),
    check("payment_entries_amount_positive", sql`${t.amount} > 0`),
    check("payment_entries_discount_nonneg", sql`${t.discountAmount} >= 0`),
  ],
);

// =========================================================================
// NEW — payment_entry_allocations
//
// One payment_entry can settle multiple documents (V1.5 UI). For V1, the
// usual case is one allocation per payment. Sum of allocations against a
// document = its derived `amount_received`.
// =========================================================================

export const paymentEntryAllocations = pgTable(
  "payment_entry_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    paymentEntryId: uuid("payment_entry_id")
      .notNull()
      .references(() => paymentEntries.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),
    allocatedAmount: money("allocated_amount").notNull(),
    createdAt: lifecycle.createdAt,
  },
  (t) => [
    index("payment_entry_alloc_entry_idx").on(t.paymentEntryId),
    index("payment_entry_alloc_document_idx").on(t.documentId),
    check(
      "payment_entry_alloc_amount_positive",
      sql`${t.allocatedAmount} > 0`,
    ),
  ],
);

// =========================================================================
// NEW — ledger_entries
//
// Single table for BOTH party ledgers and money-account ledgers.
// Discriminator: exactly one of `party_id` / `money_account_id` is populated
// (CHECK constraint enforced — silent corruption would break every report).
// Exactly one of `debit_amount` / `credit_amount` is populated; the other
// must be NULL (not 0) — keeps the row's direction unambiguous.
//
// Balance per party = SUM(debit_amount) - SUM(credit_amount).
// Same for money_account ledger.
// =========================================================================

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    voucherType: voucherType("voucher_type").notNull(),
    /** Nullable for `opening_balance` rows (which sit at FY start, no date). */
    entryDate: date("entry_date"),
    partyId: uuid("party_id").references(() => parties.id, {
      onDelete: "restrict",
    }),
    moneyAccountId: uuid("money_account_id").references(
      () => moneyAccounts.id,
      { onDelete: "restrict" },
    ),
    /** Document that produced this row (sales/purchase/credit/debit). */
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    /** Payment entry that produced this row (payment_in/out + settlement). */
    paymentEntryId: uuid("payment_entry_id").references(
      () => paymentEntries.id,
      { onDelete: "set null" },
    ),
    debitAmount: money("debit_amount"),
    creditAmount: money("credit_amount"),
    narration: text("narration"),
    /** Links the two legs of a money-account transfer. */
    transferPairId: uuid("transfer_pair_id"),
    /** Set when this row is reversed by a cancellation row. */
    reversedByLedgerEntryId: uuid("reversed_by_ledger_entry_id").references(
      (): AnyPgColumn => ledgerEntries.id,
      { onDelete: "set null" },
    ),
    createdAt: lifecycle.createdAt,
  },
  (t) => [
    index("ledger_entries_business_party_date_idx").on(
      t.businessId,
      t.partyId,
      t.entryDate,
    ),
    index("ledger_entries_business_money_date_idx").on(
      t.businessId,
      t.moneyAccountId,
      t.entryDate,
    ),
    index("ledger_entries_document_idx").on(t.documentId),
    index("ledger_entries_payment_idx").on(t.paymentEntryId),
    index("ledger_entries_transfer_pair_idx").on(t.transferPairId),
    /**
     * Exactly one of debit_amount / credit_amount populated. NULL the other.
     * (Using NULL vs 0 keeps the row's direction unambiguous.)
     */
    check(
      "ledger_entries_one_side",
      sql`(${t.debitAmount} is not null and ${t.creditAmount} is null) or (${t.debitAmount} is null and ${t.creditAmount} is not null)`,
    ),
    /** Whichever side is populated must be > 0. */
    check(
      "ledger_entries_amount_positive",
      sql`coalesce(${t.debitAmount}, ${t.creditAmount}) > 0`,
    ),
    /**
     * Exactly one of party_id / money_account_id populated. Every row is one
     * leg of a transaction touching one ledger.
     */
    check(
      "ledger_entries_one_ledger",
      sql`(${t.partyId} is not null and ${t.moneyAccountId} is null) or (${t.partyId} is null and ${t.moneyAccountId} is not null)`,
    ),
  ],
);

// =========================================================================
// NEW — item_stock_movements
//
// Append-only per-item stock ledger. Corrections are new rows, never edits.
// Renamed to `stock_movements` in PR2 (after the legacy product-bound table
// is dropped).
// =========================================================================

export const itemStockMovements = pgTable(
  "item_stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    txnDate: date("txn_date").notNull().defaultNow(),
    txnType: stockTxnType("txn_type").notNull(),
    /** Signed: + inflow, − outflow. */
    qty: quantity("qty").notNull(),
    /** Stock-on-hand snapshot AFTER this row applies (perf cache). */
    closingStockAfter: quantity("closing_stock_after"),
    /** The doc that caused the movement (sale / purchase / return). */
    relatedDocId: uuid("related_doc_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    relatedPartyId: uuid("related_party_id").references(() => parties.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: lifecycle.createdAt,
  },
  (t) => [
    index("item_stock_movements_item_idx").on(t.itemId),
    index("item_stock_movements_related_doc_idx").on(t.relatedDocId),
    index("item_stock_movements_business_date_idx").on(
      t.businessId,
      t.txnDate,
    ),
  ],
);

// =========================================================================
// Inferred types — single source of truth for row shapes
// =========================================================================

// Auth + tenancy
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
export type BusinessMember = typeof businessMembers.$inferSelect;
export type NewBusinessMember = typeof businessMembers.$inferInsert;

// Legacy (drop in PR2)
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;

// Cross-domain
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// New — parties
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;
export type PartyCategory = typeof partyCategories.$inferSelect;
export type NewPartyCategory = typeof partyCategories.$inferInsert;
export type PartyAddress = typeof partyAddresses.$inferSelect;
export type NewPartyAddress = typeof partyAddresses.$inferInsert;
export type PartyBankAccount = typeof partyBankAccounts.$inferSelect;
export type NewPartyBankAccount = typeof partyBankAccounts.$inferInsert;
export type PartyContactPerson = typeof partyContactPersons.$inferSelect;
export type NewPartyContactPerson = typeof partyContactPersons.$inferInsert;
export type PartyCustomFieldDefinition =
  typeof partyCustomFieldDefinitions.$inferSelect;
export type NewPartyCustomFieldDefinition =
  typeof partyCustomFieldDefinitions.$inferInsert;
export type PartyCustomFieldValue =
  typeof partyCustomFieldValues.$inferSelect;
export type NewPartyCustomFieldValue =
  typeof partyCustomFieldValues.$inferInsert;

// New — items
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemCategory = typeof itemCategories.$inferSelect;
export type NewItemCategory = typeof itemCategories.$inferInsert;
export type ItemUnit = typeof itemUnits.$inferSelect;
export type NewItemUnit = typeof itemUnits.$inferInsert;
export type ItemPartyPrice = typeof itemPartyPrices.$inferSelect;
export type NewItemPartyPrice = typeof itemPartyPrices.$inferInsert;
export type ItemCustomFieldDefinition =
  typeof itemCustomFieldDefinitions.$inferSelect;
export type NewItemCustomFieldDefinition =
  typeof itemCustomFieldDefinitions.$inferInsert;
export type ItemCustomFieldValue = typeof itemCustomFieldValues.$inferSelect;
export type NewItemCustomFieldValue =
  typeof itemCustomFieldValues.$inferInsert;
export type ItemStockMovement = typeof itemStockMovements.$inferSelect;
export type NewItemStockMovement = typeof itemStockMovements.$inferInsert;

// New — money + documents + ledger
export type MoneyAccount = typeof moneyAccounts.$inferSelect;
export type NewMoneyAccount = typeof moneyAccounts.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentLineItem = typeof documentLineItems.$inferSelect;
export type NewDocumentLineItem = typeof documentLineItems.$inferInsert;
export type DocumentAdditionalCharge =
  typeof documentAdditionalCharges.$inferSelect;
export type NewDocumentAdditionalCharge =
  typeof documentAdditionalCharges.$inferInsert;
export type DocumentCounter = typeof documentCounters.$inferSelect;
export type NewDocumentCounter = typeof documentCounters.$inferInsert;
export type PaymentEntry = typeof paymentEntries.$inferSelect;
export type NewPaymentEntry = typeof paymentEntries.$inferInsert;
export type PaymentEntryAllocation =
  typeof paymentEntryAllocations.$inferSelect;
export type NewPaymentEntryAllocation =
  typeof paymentEntryAllocations.$inferInsert;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;

// Enum value unions
export type Role = (typeof memberRole.enumValues)[number];
export type PartyTypeValue = (typeof partyType.enumValues)[number];
export type ItemTypeValue = (typeof itemType.enumValues)[number];
export type DocTypeValue = (typeof docType.enumValues)[number];
export type DocStatusValue = (typeof docStatus.enumValues)[number];
export type PaymentEntryTypeValue =
  (typeof paymentEntryType.enumValues)[number];
export type PaymentEntryStatusValue =
  (typeof paymentEntryStatus.enumValues)[number];
export type VoucherTypeValue = (typeof voucherType.enumValues)[number];
export type StockTxnTypeValue = (typeof stockTxnType.enumValues)[number];
export type MoneyAccountTypeValue =
  (typeof moneyAccountType.enumValues)[number];
export type PartyAddressKindValue =
  (typeof partyAddressKind.enumValues)[number];
