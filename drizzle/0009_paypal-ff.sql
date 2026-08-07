ALTER TABLE "shops" ADD COLUMN "paypalff_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "paypal_email" text;