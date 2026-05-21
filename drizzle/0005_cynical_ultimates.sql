CREATE TYPE "public"."doc_status" AS ENUM('draft', 'unpaid', 'partial_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('sales_invoice', 'estimate', 'delivery_challan', 'credit_note', 'purchase_invoice', 'debit_note', 'quotation', 'proforma_invoice');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('product', 'service');--> statement-breakpoint
CREATE TYPE "public"."money_account_type" AS ENUM('cash', 'bank');--> statement-breakpoint
CREATE TYPE "public"."party_address_kind" AS ENUM('billing', 'shipping');--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('customer', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."payment_entry_status" AS ENUM('recorded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_entry_type" AS ENUM('payment_in', 'payment_out');--> statement-breakpoint
CREATE TYPE "public"."stock_txn_type" AS ENUM('opening_stock', 'sale', 'purchase', 'manual_adjustment', 'sales_return', 'purchase_return', 'transfer_in', 'transfer_out');--> statement-breakpoint
CREATE TYPE "public"."voucher_type" AS ENUM('opening_balance', 'sales_invoice', 'purchase_invoice', 'credit_note', 'debit_note', 'payment_in', 'payment_out', 'settlement_discount', 'manual_adjustment', 'transfer_in', 'transfer_out', 'bank_charges', 'reversal');--> statement-breakpoint
CREATE TABLE "document_additional_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"taxable" boolean DEFAULT false NOT NULL,
	"gst_rate" numeric(5, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_additional_charges_taxable_has_rate" CHECK ("document_additional_charges"."taxable" = false or "document_additional_charges"."gst_rate" is not null)
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"fy_year" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"sequence_template" text DEFAULT '{PREFIX}{SEQ:3}' NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	"reset_each_fy" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_next_seq_positive" CHECK ("document_counters"."next_sequence" >= 1)
);
--> statement-breakpoint
CREATE TABLE "document_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid,
	"item_name_snapshot" text NOT NULL,
	"hsn_sac_code_snapshot" text,
	"unit_code_snapshot" text,
	"description" text,
	"quantity" numeric(12, 3) NOT NULL,
	"secondary_quantity" numeric(12, 3),
	"secondary_unit_code" text,
	"price_per_unit" numeric(12, 2) NOT NULL,
	"price_includes_tax" boolean DEFAULT false NOT NULL,
	"discount_percent" numeric(5, 2),
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gst_rate" numeric(5, 2),
	"taxable_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"doc_number" text,
	"doc_date" date DEFAULT now() NOT NULL,
	"party_id" uuid NOT NULL,
	"ship_to_address_id" uuid,
	"source_doc_id" uuid,
	"original_doc_number" text,
	"original_doc_date" date,
	"payment_terms_days" integer,
	"due_date" date,
	"place_of_supply_state_code" text,
	"signature_url" text,
	"terms_conditions" text,
	"notes" text,
	"currency_code" text DEFAULT 'INR' NOT NULL,
	"auto_round_off_enabled" boolean DEFAULT false NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_line_discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_charges_taxable" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additional_charges_non_taxable" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bill_level_discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(12, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_received" numeric(12, 2) DEFAULT '0' NOT NULL,
	"transport_mode" text,
	"vehicle_number" text,
	"eway_bill_number" text,
	"share_token" text,
	"status" "doc_status" DEFAULT 'draft' NOT NULL,
	"finalised_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "documents_grand_total_nonneg" CHECK ("documents"."grand_total" >= 0),
	CONSTRAINT "documents_finalised_has_number" CHECK ("documents"."status" = 'draft' or "documents"."doc_number" is not null)
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_party_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"sales_price" numeric(12, 2),
	"purchase_price" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"txn_date" date DEFAULT now() NOT NULL,
	"txn_type" "stock_txn_type" NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"closing_stock_after" numeric(12, 3),
	"related_doc_id" uuid,
	"related_party_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_units" (
	"code" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"business_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"type" "item_type" DEFAULT 'product' NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"code" text,
	"hsn_sac_code" text,
	"measuring_unit_code" text,
	"alternative_unit_code" text,
	"sales_price" numeric(12, 2),
	"sales_price_includes_tax" boolean DEFAULT false NOT NULL,
	"purchase_price" numeric(12, 2),
	"purchase_price_includes_tax" boolean DEFAULT false NOT NULL,
	"gst_rate" numeric(5, 2),
	"discount_on_sales_price_percent" numeric(5, 2),
	"opening_stock" numeric(12, 3),
	"opening_stock_as_of_date" date,
	"enable_low_stock_warning" boolean DEFAULT false NOT NULL,
	"low_stock_threshold" numeric(12, 3),
	"description" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"show_in_online_store" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"voucher_type" "voucher_type" NOT NULL,
	"entry_date" date,
	"party_id" uuid,
	"money_account_id" uuid,
	"document_id" uuid,
	"payment_entry_id" uuid,
	"debit_amount" numeric(12, 2),
	"credit_amount" numeric(12, 2),
	"narration" text,
	"transfer_pair_id" uuid,
	"reversed_by_ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_one_side" CHECK (("ledger_entries"."debit_amount" is not null and "ledger_entries"."credit_amount" is null) or ("ledger_entries"."debit_amount" is null and "ledger_entries"."credit_amount" is not null)),
	CONSTRAINT "ledger_entries_amount_positive" CHECK (coalesce("ledger_entries"."debit_amount", "ledger_entries"."credit_amount") > 0),
	CONSTRAINT "ledger_entries_one_ledger" CHECK (("ledger_entries"."party_id" is not null and "ledger_entries"."money_account_id" is null) or ("ledger_entries"."party_id" is null and "ledger_entries"."money_account_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "money_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"type" "money_account_type" NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"bank_account_number" text,
	"ifsc" text,
	"account_holder_name" text,
	"bank_name" text,
	"branch_name" text,
	"upi_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"type" "party_type" NOT NULL,
	"name" text NOT NULL,
	"mobile_number" text,
	"email" text,
	"gstin" text,
	"pan_number" text,
	"category_id" uuid,
	"credit_period_days" integer DEFAULT 30 NOT NULL,
	"credit_limit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"contact_person_name" text,
	"contact_person_dob" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "party_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"kind" "party_address_kind" NOT NULL,
	"label" text,
	"street_address" text,
	"city" text,
	"state" text,
	"state_code" text,
	"pincode" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "party_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"bank_account_number" text NOT NULL,
	"ifsc" text,
	"account_holder_name" text,
	"bank_name" text,
	"branch_name" text,
	"upi_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "party_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "party_contact_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"name" text NOT NULL,
	"designation" text,
	"phone" text,
	"email" text,
	"dob" date,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "party_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "party_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"entry_type" "payment_entry_type" NOT NULL,
	"entry_date" date DEFAULT now() NOT NULL,
	"party_id" uuid NOT NULL,
	"money_account_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_mode" "payment_method" NOT NULL,
	"reference" text,
	"notes" text,
	"status" "payment_entry_status" DEFAULT 'recorded' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "payment_entries_amount_positive" CHECK ("payment_entries"."amount" > 0),
	CONSTRAINT "payment_entries_discount_nonneg" CHECK ("payment_entries"."discount_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_entry_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"payment_entry_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"allocated_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_entry_alloc_amount_positive" CHECK ("payment_entry_allocations"."allocated_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "pan_number" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "is_gst_registered" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "business_type" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "industry_type" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "business_registration_type" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "signature_url" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "signature_mode" text DEFAULT 'empty_box' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "signatory_name" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "additional_details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "doc_type_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "fy_start_month" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "enable_tds" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "enable_tcs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_additional_charges" ADD CONSTRAINT "document_additional_charges_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_additional_charges" ADD CONSTRAINT "document_additional_charges_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_line_items" ADD CONSTRAINT "document_line_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_line_items" ADD CONSTRAINT "document_line_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_line_items" ADD CONSTRAINT "document_line_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_ship_to_address_id_party_addresses_id_fk" FOREIGN KEY ("ship_to_address_id") REFERENCES "public"."party_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_doc_id_documents_id_fk" FOREIGN KEY ("source_doc_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_custom_field_definitions" ADD CONSTRAINT "item_custom_field_definitions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_custom_field_values" ADD CONSTRAINT "item_custom_field_values_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_custom_field_values" ADD CONSTRAINT "item_custom_field_values_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_custom_field_values" ADD CONSTRAINT "item_custom_field_values_definition_id_item_custom_field_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."item_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_party_prices" ADD CONSTRAINT "item_party_prices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_party_prices" ADD CONSTRAINT "item_party_prices_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_party_prices" ADD CONSTRAINT "item_party_prices_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock_movements" ADD CONSTRAINT "item_stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock_movements" ADD CONSTRAINT "item_stock_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock_movements" ADD CONSTRAINT "item_stock_movements_related_doc_id_documents_id_fk" FOREIGN KEY ("related_doc_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock_movements" ADD CONSTRAINT "item_stock_movements_related_party_id_parties_id_fk" FOREIGN KEY ("related_party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_stock_movements" ADD CONSTRAINT "item_stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_measuring_unit_code_item_units_code_fk" FOREIGN KEY ("measuring_unit_code") REFERENCES "public"."item_units"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_alternative_unit_code_item_units_code_fk" FOREIGN KEY ("alternative_unit_code") REFERENCES "public"."item_units"("code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_money_account_id_money_accounts_id_fk" FOREIGN KEY ("money_account_id") REFERENCES "public"."money_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_entry_id_payment_entries_id_fk" FOREIGN KEY ("payment_entry_id") REFERENCES "public"."payment_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversed_by_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("reversed_by_ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_category_id_party_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."party_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_addresses" ADD CONSTRAINT "party_addresses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_addresses" ADD CONSTRAINT "party_addresses_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_bank_accounts" ADD CONSTRAINT "party_bank_accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_bank_accounts" ADD CONSTRAINT "party_bank_accounts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_categories" ADD CONSTRAINT "party_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_contact_persons" ADD CONSTRAINT "party_contact_persons_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_contact_persons" ADD CONSTRAINT "party_contact_persons_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_custom_field_definitions" ADD CONSTRAINT "party_custom_field_definitions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_custom_field_values" ADD CONSTRAINT "party_custom_field_values_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_custom_field_values" ADD CONSTRAINT "party_custom_field_values_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_custom_field_values" ADD CONSTRAINT "party_custom_field_values_definition_id_party_custom_field_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."party_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_money_account_id_money_accounts_id_fk" FOREIGN KEY ("money_account_id") REFERENCES "public"."money_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entry_allocations" ADD CONSTRAINT "payment_entry_allocations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entry_allocations" ADD CONSTRAINT "payment_entry_allocations_payment_entry_id_payment_entries_id_fk" FOREIGN KEY ("payment_entry_id") REFERENCES "public"."payment_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_entry_allocations" ADD CONSTRAINT "payment_entry_allocations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_additional_charges_document_idx" ON "document_additional_charges" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_counters_business_type_fy_uq" ON "document_counters" USING btree ("business_id","doc_type","fy_year");--> statement-breakpoint
CREATE INDEX "document_line_items_document_idx" ON "document_line_items" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_line_items_item_idx" ON "document_line_items" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_business_type_number_uq" ON "documents" USING btree ("business_id","doc_type","doc_number") WHERE "documents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "documents_business_status_idx" ON "documents" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "documents_business_type_date_idx" ON "documents" USING btree ("business_id","doc_type","doc_date");--> statement-breakpoint
CREATE INDEX "documents_party_idx" ON "documents" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "documents_source_doc_idx" ON "documents" USING btree ("source_doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_business_name_uq" ON "item_categories" USING btree ("business_id","name") WHERE "item_categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "item_categories_business_idx" ON "item_categories" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_cfd_business_name_uq" ON "item_custom_field_definitions" USING btree ("business_id","name") WHERE "item_custom_field_definitions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "item_cfd_business_idx" ON "item_custom_field_definitions" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_cfv_item_def_uq" ON "item_custom_field_values" USING btree ("item_id","definition_id");--> statement-breakpoint
CREATE INDEX "item_cfv_item_idx" ON "item_custom_field_values" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_party_prices_item_party_uq" ON "item_party_prices" USING btree ("item_id","party_id");--> statement-breakpoint
CREATE INDEX "item_party_prices_party_idx" ON "item_party_prices" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "item_stock_movements_item_idx" ON "item_stock_movements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "item_stock_movements_related_doc_idx" ON "item_stock_movements" USING btree ("related_doc_id");--> statement-breakpoint
CREATE INDEX "item_stock_movements_business_date_idx" ON "item_stock_movements" USING btree ("business_id","txn_date");--> statement-breakpoint
CREATE INDEX "item_units_business_idx" ON "item_units" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "items_business_idx" ON "items" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "items_business_category_idx" ON "items" USING btree ("business_id","category_id");--> statement-breakpoint
CREATE INDEX "items_business_type_idx" ON "items" USING btree ("business_id","type");--> statement-breakpoint
CREATE INDEX "ledger_entries_business_party_date_idx" ON "ledger_entries" USING btree ("business_id","party_id","entry_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_business_money_date_idx" ON "ledger_entries" USING btree ("business_id","money_account_id","entry_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_document_idx" ON "ledger_entries" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_payment_idx" ON "ledger_entries" USING btree ("payment_entry_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transfer_pair_idx" ON "ledger_entries" USING btree ("transfer_pair_id");--> statement-breakpoint
CREATE INDEX "money_accounts_business_idx" ON "money_accounts" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "money_accounts_business_default_uq" ON "money_accounts" USING btree ("business_id","type") WHERE "money_accounts"."is_default" = true and "money_accounts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "parties_business_idx" ON "parties" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "parties_business_type_idx" ON "parties" USING btree ("business_id","type");--> statement-breakpoint
CREATE INDEX "parties_business_mobile_idx" ON "parties" USING btree ("business_id","mobile_number");--> statement-breakpoint
CREATE INDEX "parties_business_gstin_idx" ON "parties" USING btree ("business_id","gstin");--> statement-breakpoint
CREATE INDEX "parties_category_idx" ON "parties" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "party_addresses_party_idx" ON "party_addresses" USING btree ("party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "party_addresses_one_billing_uq" ON "party_addresses" USING btree ("party_id") WHERE "party_addresses"."kind" = 'billing' and "party_addresses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "party_bank_accounts_party_idx" ON "party_bank_accounts" USING btree ("party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "party_categories_business_name_uq" ON "party_categories" USING btree ("business_id","name") WHERE "party_categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "party_categories_business_idx" ON "party_categories" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "party_contact_persons_party_idx" ON "party_contact_persons" USING btree ("party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "party_cfd_business_name_uq" ON "party_custom_field_definitions" USING btree ("business_id","name") WHERE "party_custom_field_definitions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "party_cfd_business_idx" ON "party_custom_field_definitions" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "party_cfv_party_def_uq" ON "party_custom_field_values" USING btree ("party_id","definition_id");--> statement-breakpoint
CREATE INDEX "party_cfv_party_idx" ON "party_custom_field_values" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "payment_entries_business_idx" ON "payment_entries" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "payment_entries_party_idx" ON "payment_entries" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "payment_entries_money_account_idx" ON "payment_entries" USING btree ("money_account_id");--> statement-breakpoint
CREATE INDEX "payment_entries_business_date_idx" ON "payment_entries" USING btree ("business_id","entry_date");--> statement-breakpoint
CREATE INDEX "payment_entry_alloc_entry_idx" ON "payment_entry_allocations" USING btree ("payment_entry_id");--> statement-breakpoint
CREATE INDEX "payment_entry_alloc_document_idx" ON "payment_entry_allocations" USING btree ("document_id");