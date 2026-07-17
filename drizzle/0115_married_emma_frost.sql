CREATE TABLE "guild_trade_weekly" (
	"guild_id" integer PRIMARY KEY NOT NULL,
	"week_key" text NOT NULL,
	"contract_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"eligible_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_trade_weekly" ADD CONSTRAINT "guild_trade_weekly_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;