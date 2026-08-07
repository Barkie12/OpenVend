CREATE TABLE "product_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "compare_at_price_cents" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "min_quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "max_quantity" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "product_groups" ADD CONSTRAINT "product_groups_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_groups"("id") ON DELETE set null ON UPDATE no action;