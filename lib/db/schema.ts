/**
 * AstraBill — database schema (single source of truth for data shape).
 *
 * 12 tables: 11 business tables + `accounts` (NextAuth Google OAuth adapter).
 * See DECISIONS.md and wiki/decision/v1-scope.md.
 *
 * Conventions:
 * - Money is `NUMERIC(12,2)` — never float. Quantities are `NUMERIC(12,3)`
 *   (fractional units: kg, sq.ft.). GST rates are `NUMERIC(5,2)`.
 * - Instants are `timestamptz` (UTC). Calendar dates (issue/due) are `date`.
 * - Every business table carries `business_id` — tenant isolation is enforced
 *   by query scoping in the repository layer (no RLS). See database-and-rbac.
 * - Mutable business tables carry `deleted_at` (soft delete).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
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

// --- Column helpers ------------------------------------------------------

/** Money — exact, 2 decimal places. Never use float for currency. */
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
/** Quantity — 3 decimal places for fractional units (kg, sq.ft.). */
const quantity = (name: string) => numeric(name, { precision: 12, scale: 3 });
/** GST rate as a percentage, e.g. 18.00. */
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

// --- Enums ---------------------------------------------------------------

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

export const invoiceType = pgEnum("invoice_type", [
  "tax_invoice",
  "estimate", // kacha/pakka: shown as "Estimate"
  "cash_receipt", // kacha/pakka: shown as "Cash Receipt"
  "credit_note",
  "debit_note",
  "delivery_challan", // non-GST goods-movement note
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "seen",
  "partially_paid",
  "paid",
  "overdue",
]);

export const unit = pgEnum("unit", [
  "sqft",
  "kg",
  "pcs",
  "linear_ft",
  "box",
  "dozen",
  "sqm", // glass bills per square metre
  "set", // hardware sells in sets — "30 set @ ₹530/set"
]);

export const paymentMethod = pgEnum("payment_method", [
  "upi",
  "cash",
  "bank_transfer",
  "card",
  "cheque",
  "other",
]);

export const stockMovementType = pgEnum("stock_movement_type", ["in", "out"]);

export const whatsappStatus = pgEnum("whatsapp_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);

// --- users ---------------------------------------------------------------
// Primary login is WhatsApp OTP (phone). Google OAuth is the fallback (email).
// Both phone and email are nullable: an OTP user may have no email, a
// Google-only user has no phone yet. Each is unique when present.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  phone: text("phone").unique(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  email: text("email").unique(),
  // `emailVerified` name is required by the NextAuth DrizzleAdapter.
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // Throttled write — only refreshed when stale (see lib/rbac / session code).
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  ...lifecycle,
  ...softDelete,
});

// --- accounts (NextAuth adapter — Google OAuth) ---------------------------

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

// --- businesses ----------------------------------------------------------

/**
 * Per-business invoice display settings — currently line-items column
 * visibility. Stored as `invoice_settings` jsonb. The default shows the
 * columns a general trading shop needs and hides the pharma-specific ones
 * (batch / MFG / EXP); 2C.5 surfaces the toggles in the branding UI and
 * ships a template that renders those columns.
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

export const businesses = pgTable("businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  gstin: text("gstin"), // 15-char GSTIN; null for unregistered shops
  phone: text("phone"),
  email: text("email"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  // 2-digit GST state code — drives CGST/SGST (intrastate) vs IGST (interstate).
  stateCode: text("state_code"),
  pincode: text("pincode"),
  logoUrl: text("logo_url"),
  // Bank / payment details printed on the invoice.
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankIfsc: text("bank_ifsc"),
  bankAccountHolder: text("bank_account_holder"),
  upiId: text("upi_id"),
  // Default T&C block (late-payment interest, jurisdiction…) printed on the
  // invoice PDF. Per-invoice override is a later addition.
  invoiceTerms: text("invoice_terms"),
  // Overrides the per-type default invoice-number prefix (INV/EST/CR/...).
  // Null → the service uses the per-type default.
  invoiceNumberPrefix: text("invoice_number_prefix"),
  // --- invoice branding (Phase 2C) ---
  // Free string + Zod-validated at the API boundary, not pg enums — 2C.5
  // templates / fonts add without an enum-altering migration.
  brandColor: text("brand_color").notNull().default("#2563eb"),
  brandFont: text("brand_font").notNull().default("inter"),
  invoiceTemplateId: text("invoice_template_id").notNull().default("modern"),
  invoiceSettings: jsonb("invoice_settings")
    .$type<InvoiceSettings>()
    .notNull()
    .default(DEFAULT_INVOICE_SETTINGS),
  // Subscription plan — gates feature limits at the service layer.
  plan: planTier("plan").notNull().default("free"),
  planValidUntil: date("plan_valid_until"),
  ...lifecycle,
  ...softDelete,
});

// --- business_members (one user ↔ many businesses, role per business) -----

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
    ...softDelete, // removing a teammate = soft delete of their membership
  },
  (t) => [
    // A user has at most one active membership per business.
    uniqueIndex("business_members_business_user_uq")
      .on(t.businessId, t.userId)
      .where(sql`${t.deletedAt} is null`),
    index("business_members_user_idx").on(t.userId),
  ],
);

// --- customers -----------------------------------------------------------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"), // WhatsApp delivery target
    email: text("email"),
    gstin: text("gstin"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"), // for CGST/SGST vs IGST determination
    pincode: text("pincode"),
    notes: text("notes"),
    ...lifecycle,
    ...softDelete,
  },
  (t) => [index("customers_business_idx").on(t.businessId)],
);

// --- products ------------------------------------------------------------

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
    // Nullable: a shop may not track cost. Hidden from roles without
    // `report:view_profit` at the serialization layer (see lib/rbac).
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

// --- extra charges (shape of the `invoices.extra_charges` JSONB) ----------
// One ad-hoc charge on an invoice. Taxable charges (cutting, hole, processing)
// fold into the taxable base pre-GST at their own `gstRate`; non-taxable ones
// (informal freight, loading) are added post-tax. `amount`/`gstRate` are
// strings — `numeric` precision must survive the JSON round-trip (a JSON
// number would be parsed back as a lossy JS `number`).

export type ExtraCharge = {
  label: string;
  /** Money string, 2 decimals. */
  amount: string;
  taxable: boolean;
  /** GST rate as a percentage string ("18.00"); required when `taxable`. */
  gstRate?: string;
};

// --- invoices ------------------------------------------------------------
// Holds tax invoices, estimates, cash receipts, and credit/debit notes —
// distinguished by `type`. `originalInvoiceId` links a note to its source.

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
    // Assigned only on finalise, as `{prefix}/{FY}/{seq}` (e.g. `INV/26-27/0001`).
    // Drafts have `number IS NULL` — Postgres treats NULLs as distinct in the
    // unique index below, so unfinalised drafts coexist without contention.
    // The sequence resets per business + type + financial year and counts only
    // finalised rows, so an abandoned draft never burns a number.
    number: text("number"),
    // Customer-facing share identifier — the `/i/[shareToken]` public-view URL
    // the WhatsApp button points at. 16 chars of URL-safe random (~96 bits of
    // entropy — unguessable; not the row UUID, which we don't expose to keep
    // enumeration off the table). Generated at finalise alongside the number;
    // NULL for drafts (and for finalised rows from before this column existed,
    // which the send path backfills lazily).
    shareToken: text("share_token").unique(),
    status: invoiceStatus("status").notNull().default("draft"),
    // Self-reference: credit/debit note → the invoice it adjusts.
    originalInvoiceId: uuid("original_invoice_id").references(
      (): AnyPgColumn => invoices.id,
      { onDelete: "set null" },
    ),
    // GST place of supply (2-digit state code); vs business.stateCode it
    // decides CGST+SGST (intrastate) or IGST (interstate).
    placeOfSupplyStateCode: text("place_of_supply_state_code"),
    // Amounts — all derived in the service layer, stored for fast reads + PDF.
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
    // Optional consignee, distinct from the bill-to customer. Null → the
    // bill-to customer is also the ship-to party.
    shipToName: text("ship_to_name"),
    shipToAddress: text("ship_to_address"),
    // Ad-hoc charges — see the ExtraCharge type above. Defaults to an empty
    // array so reads never have to null-check.
    extraCharges: jsonb("extra_charges")
      .$type<ExtraCharge[]>()
      .notNull()
      .default([]),
    // Goods-movement metadata, printed on the invoice / delivery challan.
    transportMode: text("transport_mode"),
    vehicleNumber: text("vehicle_number"),
    // Recorded only — e-way-bill generation is post-V1.
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

// --- invoice_line_items --------------------------------------------------
// Snapshots product name / HSN / price at invoice time — products mutate,
// issued invoices must not.

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
    // Null for custom line items (cutting charges, transport, labour).
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(), // product name snapshot or custom text
    hsnCode: text("hsn_code"),
    quantity: quantity("quantity").notNull(),
    unit: unit("unit").notNull(),
    // Optional informational second unit — glass is billed per sqm but
    // counted in pcs. GST math runs on the rate-bearing quantity+unit above
    // ONLY; this pair never enters tax calculation.
    secondaryQuantity: quantity("secondary_quantity"),
    secondaryUnit: unit("secondary_unit"),
    unitPrice: money("unit_price").notNull(),
    discountAmount: money("discount_amount").notNull().default("0"),
    gstRate: rate("gst_rate").notNull().default("0"),
    taxableAmount: money("taxable_amount").notNull(),
    cgstAmount: money("cgst_amount").notNull().default("0"),
    sgstAmount: money("sgst_amount").notNull().default("0"),
    igstAmount: money("igst_amount").notNull().default("0"),
    amount: money("amount").notNull(), // line total incl. tax
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: lifecycle.createdAt,
  },
  (t) => [index("invoice_line_items_invoice_idx").on(t.invoiceId)],
);

// --- payments ------------------------------------------------------------

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
    reference: text("reference"), // UPI txn ref / cheque number / free note
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

// --- whatsapp_messages ---------------------------------------------------
// Log of invoice / receipt / reminder messages. OTP messages are NOT here —
// OTPs live in Redis.

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
    messageId: text("message_id"), // Meta message id (wamid)
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

// --- stock_movements -----------------------------------------------------
// Append-only stock ledger. Corrections are new movements, never edits.

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
    // The invoice that caused an "out" movement, if any.
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

// --- audit_log -----------------------------------------------------------
// Append-only. Every data mutation + auth event, written in-transaction from
// the service layer. Never updated, never deleted.

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Nullable: account-level events (e.g. auth.login) have no business.
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    // Nullable: system-initiated actions have no human actor.
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // e.g. "invoice.create", "auth.login"
    entityType: text("entity_type"), // e.g. "invoice"
    entityId: uuid("entity_id"),
    changes: jsonb("changes"), // before/after diff
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: lifecycle.createdAt,
  },
  (t) => [
    index("audit_log_business_created_idx").on(t.businessId, t.createdAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

// --- Inferred types (single source of truth for row shapes) --------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
export type BusinessMember = typeof businessMembers.$inferSelect;
export type NewBusinessMember = typeof businessMembers.$inferInsert;
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
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

export type Role = (typeof memberRole.enumValues)[number];
