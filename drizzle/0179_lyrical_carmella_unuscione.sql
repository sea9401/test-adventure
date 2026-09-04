DROP INDEX "guild_raid_attack_logs_recent_idx";--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD COLUMN "stage" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD COLUMN "hp" bigint DEFAULT 1200000 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD COLUMN "max_hp" bigint DEFAULT 1200000 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_raid_participants" ADD COLUMN "reward_claimed_at" timestamp;--> statement-breakpoint
CREATE INDEX "guild_raid_attack_logs_recent_idx" ON "guild_raid_attack_logs" USING btree ("event_id","guild_id","created_at");--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD CONSTRAINT "guild_raid_guild_scores_stage_positive" CHECK ("guild_raid_guild_scores"."stage" > 0);--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD CONSTRAINT "guild_raid_guild_scores_hp_positive" CHECK ("guild_raid_guild_scores"."hp" > 0);--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD CONSTRAINT "guild_raid_guild_scores_max_hp_positive" CHECK ("guild_raid_guild_scores"."max_hp" > 0);