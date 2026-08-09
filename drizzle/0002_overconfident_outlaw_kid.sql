ALTER TYPE "public"."channel_type" ADD VALUE 'web';--> statement-breakpoint
ALTER TYPE "public"."llm_provider" ADD VALUE 'gemini' BEFORE 'anthropic';--> statement-breakpoint
CREATE TABLE "web_chat_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"public_key" text NOT NULL,
	"greeting" text DEFAULT 'Hi! How can I help you today?' NOT NULL,
	"theme_color" text DEFAULT '#4f46e5' NOT NULL,
	"launcher_label" text DEFAULT 'Chat with us' NOT NULL,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_config" ALTER COLUMN "llm_provider" SET DEFAULT 'gemini';--> statement-breakpoint
ALTER TABLE "web_chat_configs" ADD CONSTRAINT "web_chat_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "web_chat_configs_tenant_id_idx" ON "web_chat_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "web_chat_configs_public_key_idx" ON "web_chat_configs" USING btree ("public_key");