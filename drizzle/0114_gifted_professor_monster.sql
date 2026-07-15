CREATE TABLE "guild_dining_weekly" (
	"guild_id" integer PRIMARY KEY NOT NULL,
	"week_key" text NOT NULL,
	"selected_menu_ids" jsonb DEFAULT '["hearty_stew"]'::jsonb NOT NULL,
	"pantry_points" integer DEFAULT 0 NOT NULL,
	"target_points" integer DEFAULT 20 NOT NULL,
	"eligible_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_dining_weekly" ADD CONSTRAINT "guild_dining_weekly_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;