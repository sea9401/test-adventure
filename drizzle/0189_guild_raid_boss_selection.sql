DROP INDEX "guild_raid_guild_scores_rank_idx";--> statement-breakpoint
ALTER TABLE "guild_raid_attack_logs" ADD COLUMN "boss_kind" text DEFAULT 'mountain_chief_hard' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD COLUMN "boss_kind" text DEFAULT 'mountain_chief_hard' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD COLUMN "selected_by_user_id" text;--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD COLUMN "selected_at" timestamp;--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD COLUMN "reward_tier" text;--> statement-breakpoint
CREATE INDEX "guild_raid_guild_scores_rank_idx" ON "guild_raid_guild_scores" USING btree ("event_id","boss_kind","damage" DESC);--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD CONSTRAINT "guild_raid_guild_scores_reward_tier_valid" CHECK ("guild_raid_guild_scores"."reward_tier" IS NULL OR "guild_raid_guild_scores"."reward_tier" IN ('standard','bonus','floor'));--> statement-breakpoint
-- 이미 정산된 지난 주 점수는 모두 산군 기준 순위 보상이었다. 재실행해도 결과가 같다.
UPDATE "guild_raid_guild_scores" SET "reward_tier" = 'standard' WHERE "final_rank" IS NOT NULL AND "reward_tier" IS NULL;
