ALTER TABLE "products" ADD COLUMN "description_tabs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "meta_title" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "meta_description" text;