ALTER TABLE "coupons" ADD COLUMN "max_uses_per_customer" integer;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "min_subtotal_cents" integer;