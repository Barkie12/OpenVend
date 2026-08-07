CREATE TABLE "page_views" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"path" text NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"referrer_host" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"country" text,
	"browser" text,
	"os" text,
	"device" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "ga_measurement_id" text;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_views_created_idx" ON "page_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "page_views_session_idx" ON "page_views" USING btree ("session_id");