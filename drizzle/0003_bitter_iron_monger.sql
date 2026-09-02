ALTER TYPE "public"."plan" ADD VALUE 'basic' BEFORE 'pro';--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "razorpay_payment_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "lifetime" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "trial_ends_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL;