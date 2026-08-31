CREATE TABLE "adventurer_association_dining_weekly" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"week_key" text NOT NULL,
	"selected_menu_ids" jsonb DEFAULT '["hearty_stew"]'::jsonb NOT NULL,
	"pantry_points" integer DEFAULT 0 NOT NULL,
	"target_points" integer DEFAULT 400 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "adventurer_association_dining_weekly_points_check" CHECK ("adventurer_association_dining_weekly"."pantry_points" >= 0 AND "adventurer_association_dining_weekly"."target_points" > 0)
);
--> statement-breakpoint
CREATE TABLE "adventurer_association_facilities" (
	"building_id" text PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"target_level" integer DEFAULT 2 NOT NULL,
	"materials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "adventurer_association_facilities_level_check" CHECK ("adventurer_association_facilities"."level" BETWEEN 1 AND 5),
	CONSTRAINT "adventurer_association_facilities_target_level_check" CHECK ("adventurer_association_facilities"."target_level" BETWEEN 2 AND 5),
	CONSTRAINT "adventurer_association_facilities_gold_check" CHECK ("adventurer_association_facilities"."gold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "adventurer_association_trade_weekly" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"week_key" text NOT NULL,
	"contract_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target" integer DEFAULT 400 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "adventurer_association_trade_weekly_target_check" CHECK ("adventurer_association_trade_weekly"."target" > 0)
);
