CREATE TABLE "marketplace_bids_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"bidder_id" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_bids_v2_amount_pos" CHECK ("marketplace_bids_v2"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD COLUMN "bid_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
UPDATE "marketplace_listings_v2"
SET
	"bid_ends_at" = "created_at",
	"expires_at" = "created_at" + interval '48 hours';--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ALTER COLUMN "bid_ends_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD COLUMN "highest_bid" integer;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD COLUMN "highest_bidder_id" text;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD COLUMN "bid_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD COLUMN "bid_resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "marketplace_bids_v2" ADD CONSTRAINT "marketplace_bids_v2_listing_id_marketplace_listings_v2_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings_v2"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_bids_v2" ADD CONSTRAINT "marketplace_bids_v2_bidder_id_users_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_bids_v2_listing_created_idx" ON "marketplace_bids_v2" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "marketplace_bids_v2_bidder_created_idx" ON "marketplace_bids_v2" USING btree ("bidder_id","created_at");--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD CONSTRAINT "marketplace_listings_v2_highest_bidder_id_users_id_fk" FOREIGN KEY ("highest_bidder_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD CONSTRAINT "listings_v2_bid_count_nonneg" CHECK ("marketplace_listings_v2"."bid_count" >= 0);--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD CONSTRAINT "listings_v2_bid_pair_check" CHECK (("marketplace_listings_v2"."highest_bid" IS NULL AND "marketplace_listings_v2"."highest_bidder_id" IS NULL) OR ("marketplace_listings_v2"."highest_bid" > 0 AND "marketplace_listings_v2"."highest_bidder_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ADD CONSTRAINT "listings_v2_time_order_check" CHECK ("marketplace_listings_v2"."expires_at" > "marketplace_listings_v2"."bid_ends_at");
