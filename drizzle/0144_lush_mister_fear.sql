CREATE TABLE "db_storage_metrics" (
	"date_key" text PRIMARY KEY NOT NULL,
	"database_bytes" numeric(30, 0) NOT NULL,
	"table_bytes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_activity_rollups" (
	"guild_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"period_key" text NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"contribution_points" numeric(30, 0) DEFAULT '0' NOT NULL,
	"gold_amount" numeric(30, 0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_activity_rollups_guild_id_user_id_source_category_period_key_pk" PRIMARY KEY("guild_id","user_id","source","category","period_key")
);
--> statement-breakpoint
CREATE TABLE "marketplace_price_daily" (
	"date_key" text NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"trades" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"gross_gold" numeric(30, 0) DEFAULT '0' NOT NULL,
	"min_unit_price" integer NOT NULL,
	"max_unit_price" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_price_daily_date_key_kind_item_id_pk" PRIMARY KEY("date_key","kind","item_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_user_trade_totals" (
	"user_id" text PRIMARY KEY NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"sales" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_activity_rollups" ADD CONSTRAINT "guild_activity_rollups_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_user_trade_totals" ADD CONSTRAINT "marketplace_user_trade_totals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guild_activity_rollups_guild_period_idx" ON "guild_activity_rollups" USING btree ("guild_id","period_key");--> statement-breakpoint
CREATE INDEX "guild_activity_rollups_user_period_idx" ON "guild_activity_rollups" USING btree ("user_id","period_key");--> statement-breakpoint
CREATE INDEX "marketplace_price_daily_item_date_idx" ON "marketplace_price_daily" USING btree ("kind","item_id","date_key");