ALTER TYPE "public"."invoice_type" ADD VALUE 'delivery_challan';--> statement-breakpoint
ALTER TYPE "public"."unit" ADD VALUE 'sqm';--> statement-breakpoint
ALTER TYPE "public"."unit" ADD VALUE 'set';--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "invoice_terms" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "invoice_number_prefix" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "secondary_quantity" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "secondary_unit" "unit";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_name" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "extra_charges" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "transport_mode" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vehicle_number" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "eway_bill_number" text;