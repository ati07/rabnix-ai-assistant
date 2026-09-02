CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'won', 'lost');--> statement-breakpoint
ALTER TABLE "business_config" ADD COLUMN "lead_capture_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "business_config" ADD COLUMN "lead_followups" jsonb DEFAULT '{"enabled":false,"steps":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lead_status" "lead_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "converted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "kind" text DEFAULT 'appointment' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_customer_idx" ON "reminders" USING btree ("customer_id","status");