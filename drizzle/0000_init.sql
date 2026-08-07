CREATE TYPE "public"."blacklist_type" AS ENUM('email', 'ip', 'country');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."delivery_type" AS ENUM('serials', 'file', 'service');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'delivered', 'requires_review', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."product_visibility" AS ENUM('public', 'unlisted', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."stock_status" AS ENUM('available', 'reserved', 'delivered');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"type" "blacklist_type" NOT NULL,
	"value" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"code" text NOT NULL,
	"type" "coupon_type" NOT NULL,
	"value" integer NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"product_ids" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"variant_id" text,
	"product_name" text NOT NULL,
	"variant_name" text NOT NULL,
	"delivery_type" "delivery_type" NOT NULL,
	"service_instructions" text,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"order_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "orders_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"email" text NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"coupon_id" text,
	"coupon_code" text,
	"payment_provider" text,
	"access_token" text NOT NULL,
	"ip_address" text,
	"country" text,
	"user_agent" text,
	"review_reason" text,
	"reservation_expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"payment_id" text,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"order_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_files" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"product_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility" "product_visibility" DEFAULT 'public' NOT NULL,
	"delivery_type" "delivery_type" NOT NULL,
	"service_instructions" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_path" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"terms_of_service" text,
	"discord_webhook_url" text,
	"turnstile_site_key" text,
	"turnstile_secret_key_enc" text,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_secure" boolean DEFAULT true NOT NULL,
	"smtp_user" text,
	"smtp_password_enc" text,
	"smtp_from" text,
	"stripe_enabled" boolean DEFAULT false NOT NULL,
	"stripe_secret_key_enc" text,
	"stripe_webhook_secret_enc" text,
	"nowpayments_enabled" boolean DEFAULT false NOT NULL,
	"nowpayments_api_key_enc" text,
	"nowpayments_ipn_secret_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"content" text NOT NULL,
	"status" "stock_status" DEFAULT 'available' NOT NULL,
	"order_item_id" text,
	"reserved_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist_rules" ADD CONSTRAINT "blacklist_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_files" ADD CONSTRAINT "product_files_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_files" ADD CONSTRAINT "product_files_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blacklist_rules_type_value_idx" ON "blacklist_rules" USING btree ("type","value");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_idx" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_access_token_idx" ON "orders" USING btree ("access_token");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_status_expiry_idx" ON "orders" USING btree ("status","reservation_expires_at");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payment_events_order_idx" ON "payment_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_external_idx" ON "payments" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "product_files_product_idx" ON "product_files" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "stock_items_variant_status_idx" ON "stock_items" USING btree ("variant_id","status");--> statement-breakpoint
CREATE INDEX "stock_items_order_item_idx" ON "stock_items" USING btree ("order_item_id");