CREATE TABLE "marketplace_listings_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"seller_name" text NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" integer NOT NULL,
	"instance_payload" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"buyer_id" text,
	CONSTRAINT "listings_v2_kind_valid" CHECK ("marketplace_listings_v2"."kind" IN ('equip','material')),
	CONSTRAINT "listings_v2_status_valid" CHECK ("marketplace_listings_v2"."status" IN ('active','sold','cancelled')),
	CONSTRAINT "listings_v2_qty_pos" CHECK ("marketplace_listings_v2"."quantity" > 0),
	CONSTRAINT "listings_v2_price_pos" CHECK ("marketplace_listings_v2"."price" > 0)
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD CONSTRAINT "marketplace_listings_v2_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD CONSTRAINT "marketplace_listings_v2_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_v2_browse_idx" ON "marketplace_listings_v2" USING btree ("kind","created_at") WHERE "marketplace_listings_v2"."status" = 'active';--> statement-breakpoint
CREATE INDEX "listings_v2_seller_idx" ON "marketplace_listings_v2" USING btree ("seller_id","status","created_at");