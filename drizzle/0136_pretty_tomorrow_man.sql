CREATE TABLE "guild_contribution_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"activity_log_id" integer NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_contribution_events_points_positive" CHECK ("guild_contribution_events"."points" > 0)
);
--> statement-breakpoint
ALTER TABLE "guild_contribution_events" ADD CONSTRAINT "guild_contribution_events_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_contribution_events" ADD CONSTRAINT "guild_contribution_events_activity_log_id_guild_activity_log_id_fk" FOREIGN KEY ("activity_log_id") REFERENCES "public"."guild_activity_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guild_contribution_events_activity_unique_idx" ON "guild_contribution_events" USING btree ("activity_log_id");--> statement-breakpoint
CREATE INDEX "guild_contribution_events_guild_created_idx" ON "guild_contribution_events" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "guild_contribution_events_guild_user_created_idx" ON "guild_contribution_events" USING btree ("guild_id","user_id","created_at");--> statement-breakpoint

-- 기존 활동 중 기여자와 길드 이득을 정확히 복원할 수 있는 항목만 원장에 이관한다.
-- 시설·식당 재료 기부와 교역 부분 납품은 과거에 개인별 영구 기록이 없어 추정하지 않는다.
WITH scored AS (
  SELECT
    id AS activity_log_id,
    guild_id,
    actor_user_id AS user_id,
    type AS source,
    created_at,
    CASE
      WHEN type = 'gold_deposit' THEN 'funding'
      WHEN type IN ('workshop_delivery', 'workshop_craft_only', 'workshop_weekly_claim', 'artisan_rank_reward') THEN 'workshop'
      WHEN type IN ('exploration_weekly_claim', 'exploration_expedition_claim', 'exploration_event_resolve') THEN 'exploration'
      WHEN type = 'training_drill_claim' THEN 'training'
      WHEN type = 'alchemy_craft' THEN 'alchemy'
      WHEN type = 'trade_contract_complete' THEN 'trade'
      ELSE NULL
    END AS category,
    CASE
      WHEN type = 'gold_deposit'
        THEN FLOOR(COALESCE((meta->>'amount')::numeric, 0) / 10000)::integer
      WHEN type = 'workshop_delivery'
        THEN FLOOR(COALESCE((meta->>'rewardGold')::numeric, 0) / 10000)::integer
      WHEN type IN ('workshop_craft_only', 'training_drill_claim', 'alchemy_craft')
        THEN 10
      WHEN type IN (
        'workshop_weekly_claim',
        'exploration_weekly_claim',
        'exploration_expedition_claim',
        'exploration_event_resolve',
        'trade_contract_complete',
        'artisan_rank_reward'
      ) THEN
        FLOOR(COALESCE((meta->>'rewardGold')::numeric, 0) / 10000)::integer
        + FLOOR(COALESCE((meta->>'rewardFame')::numeric, 0))::integer * 10
      ELSE 0
    END AS points
  FROM guild_activity_log
  WHERE actor_user_id IS NOT NULL
)
INSERT INTO guild_contribution_events
  (guild_id, user_id, activity_log_id, source, category, points, created_at)
SELECT guild_id, user_id, activity_log_id, source, category, points, created_at
FROM scored
WHERE category IS NOT NULL AND points > 0
ON CONFLICT (activity_log_id) DO NOTHING;
