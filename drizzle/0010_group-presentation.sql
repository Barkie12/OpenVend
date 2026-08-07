ALTER TABLE "product_groups" ADD COLUMN "image_path" text;--> statement-breakpoint
ALTER TABLE "product_groups" ADD COLUMN "visibility" "product_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_groups" ADD COLUMN "badge_text" text;--> statement-breakpoint
ALTER TABLE "product_groups" ADD COLUMN "badge_color" text;