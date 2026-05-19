ALTER TABLE "businesses" ADD COLUMN "brand_color" text DEFAULT '#2563eb' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "brand_font" text DEFAULT 'inter' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "invoice_template_id" text DEFAULT 'modern' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "invoice_settings" jsonb DEFAULT '{"columns":{"hsn":true,"batch":false,"mfg":false,"exp":false,"discount":true,"tax":true,"secondaryQty":true}}'::jsonb NOT NULL;