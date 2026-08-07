ALTER TABLE "stock_items" DROP CONSTRAINT "stock_items_variant_id_product_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_items" ALTER COLUMN "variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;