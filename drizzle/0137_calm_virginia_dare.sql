CREATE TABLE "marketplace_buy_orders_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"buyer_id" text NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity_initial" integer NOT NULL,
	"quantity_remaining" integer NOT NULL,
	"gold_escrow" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"closed_at" timestamp,
	CONSTRAINT "marketplace_buy_orders_v2_kind_valid" CHECK ("marketplace_buy_orders_v2"."kind" IN ('material','consumable')),
	CONSTRAINT "marketplace_buy_orders_v2_status_valid" CHECK ("marketplace_buy_orders_v2"."status" IN ('active','filled','cancelled','expired')),
	CONSTRAINT "marketplace_buy_orders_v2_unit_price_pos" CHECK ("marketplace_buy_orders_v2"."unit_price" > 0),
	CONSTRAINT "marketplace_buy_orders_v2_qty_initial_pos" CHECK ("marketplace_buy_orders_v2"."quantity_initial" > 0),
	CONSTRAINT "marketplace_buy_orders_v2_qty_remaining_nonneg" CHECK ("marketplace_buy_orders_v2"."quantity_remaining" >= 0),
	CONSTRAINT "marketplace_buy_orders_v2_escrow_nonneg" CHECK ("marketplace_buy_orders_v2"."gold_escrow" >= 0),
	CONSTRAINT "marketplace_buy_orders_v2_expires_after_create" CHECK ("marketplace_buy_orders_v2"."expires_at" > "marketplace_buy_orders_v2"."created_at")
);
--> statement-breakpoint
CREATE TABLE "marketplace_price_alerts_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"target_unit_price" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"triggered_at" timestamp,
	CONSTRAINT "marketplace_price_alerts_v2_kind_valid" CHECK ("marketplace_price_alerts_v2"."kind" IN ('material','consumable')),
	CONSTRAINT "marketplace_price_alerts_v2_status_valid" CHECK ("marketplace_price_alerts_v2"."status" IN ('active','triggered','cancelled')),
	CONSTRAINT "marketplace_price_alerts_v2_target_pos" CHECK ("marketplace_price_alerts_v2"."target_unit_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "marketplace_buy_orders_v2" ADD CONSTRAINT "marketplace_buy_orders_v2_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_price_alerts_v2" ADD CONSTRAINT "marketplace_price_alerts_v2_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_buy_orders_v2_match_idx" ON "marketplace_buy_orders_v2" USING btree ("kind","item_id","unit_price","created_at") WHERE "marketplace_buy_orders_v2"."status" = 'active';--> statement-breakpoint
CREATE INDEX "marketplace_buy_orders_v2_buyer_idx" ON "marketplace_buy_orders_v2" USING btree ("buyer_id","status","created_at");--> statement-breakpoint
CREATE INDEX "marketplace_price_alerts_v2_match_idx" ON "marketplace_price_alerts_v2" USING btree ("kind","item_id","target_unit_price") WHERE "marketplace_price_alerts_v2"."status" = 'active';--> statement-breakpoint
CREATE INDEX "marketplace_price_alerts_v2_user_idx" ON "marketplace_price_alerts_v2" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_price_alerts_v2_user_item_active_idx" ON "marketplace_price_alerts_v2" USING btree ("user_id","kind","item_id") WHERE "marketplace_price_alerts_v2"."status" = 'active';