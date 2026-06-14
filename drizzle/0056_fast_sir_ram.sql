ALTER TABLE "coop_boss_sessions" ADD COLUMN "summoner_id" text;--> statement-breakpoint
ALTER TABLE "coop_boss_sessions" ADD COLUMN "summoner_guild_id" integer;--> statement-breakpoint
ALTER TABLE "coop_boss_sessions" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;