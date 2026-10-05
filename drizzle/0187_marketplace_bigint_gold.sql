ALTER TABLE "economy_events" ALTER COLUMN "gold_delta" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "marketplace_bids_v2" ALTER COLUMN "amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ALTER COLUMN "price" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "marketplace_listings_v2" ALTER COLUMN "highest_bid" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "marketplace_price_alerts_v2" ALTER COLUMN "target_unit_price" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "marketplace_price_daily" ALTER COLUMN "min_unit_price" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "marketplace_price_daily" ALTER COLUMN "max_unit_price" SET DATA TYPE bigint;