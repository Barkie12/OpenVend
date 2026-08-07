ALTER TABLE "shops" ADD COLUMN "email_provider" text DEFAULT 'smtp' NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "resend_api_key_enc" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "brevo_api_key_enc" text;