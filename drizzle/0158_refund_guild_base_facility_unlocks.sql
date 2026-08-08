-- 0157에서 길드 시설 7종의 Lv.1을 기본 지급으로 전환했으므로, 전환 전에
-- 유료 해금한 길드에는 당시 길드 금고에서 차감한 골드를 시설별로 돌려준다.
--
-- 운영 확인 기준:
--   - 기존 유료 해금 행은 unlock API가 만든 guild-facility:<guildId>:<buildingId> 형식이다.
--   - 0157 기본 지급 행 32개는 created_at = 2026-08-08 13:00:45.248298 이다.
--   - 그보다 먼저 생성된 31개 행만 유료 해금 기록이며, 지도 제작소와 강화 비용은 제외한다.
--
-- economy_events에 시설별 환급 원장을 먼저 남기고, 이번 실행에서 새로 기록된 원장만
-- 길드 금고에 합산한다. 따라서 SQL이 다시 실행돼도 같은 시설을 중복 환급하지 않는다.
WITH refundable_unlocks AS (
	SELECT
		village."guild_id",
		village."outpost_id",
		split_part(village."outpost_id", ':', 3) AS "building_id",
		CASE split_part(village."outpost_id", ':', 3)
			WHEN 'guild_smithy' THEN 50000000
			WHEN 'training_ground' THEN 80000000
			WHEN 'exploration_hq' THEN 65000000
			WHEN 'alchemy_workshop' THEN 60000000
			WHEN 'dining_hall' THEN 50000000
			WHEN 'trade_post' THEN 70000000
			WHEN 'guild_warehouse' THEN 60000000
		END AS "refund_gold"
	FROM "outpost_villages" AS village
	WHERE village."guild_id" IS NOT NULL
		AND village."created_at" < TIMESTAMP '2026-08-08 13:00:45.248298'
		AND village."outpost_id" =
			'guild-facility:' || village."guild_id"::text || ':' || split_part(village."outpost_id", ':', 3)
		AND split_part(village."outpost_id", ':', 3) IN (
			'guild_smithy',
			'training_ground',
			'exploration_hq',
			'alchemy_workshop',
			'dining_hall',
			'trade_post',
			'guild_warehouse'
		)
),
new_refund_events AS (
	INSERT INTO "economy_events" (
		"event_type",
		"gold_delta",
		"item_kind",
		"item_id",
		"quantity",
		"detail"
	)
	SELECT
		'guild_facility_unlock_refund',
		refundable."refund_gold",
		'guild_facility',
		refundable."building_id",
		1,
		jsonb_build_object(
			'guildId', refundable."guild_id",
			'buildingId', refundable."building_id",
			'outpostId', refundable."outpost_id",
			'reason', 'level_1_became_free',
			'sourceMigration', '0158_refund_guild_base_facility_unlocks'
		)
	FROM refundable_unlocks AS refundable
	WHERE NOT EXISTS (
		SELECT 1
		FROM "economy_events" AS existing
		WHERE existing."event_type" = 'guild_facility_unlock_refund'
			AND existing."detail" ->> 'outpostId' = refundable."outpost_id"
	)
	RETURNING "gold_delta", "detail"
),
refunds_by_guild AS (
	SELECT
		("detail" ->> 'guildId')::integer AS "guild_id",
		SUM("gold_delta")::integer AS "refund_gold"
	FROM new_refund_events
	GROUP BY ("detail" ->> 'guildId')::integer
)
INSERT INTO "v2_guild_resources" (
	"guild_id",
	"gold",
	"settlement",
	"warehouse",
	"updated_at"
)
SELECT
	refund."guild_id",
	refund."refund_gold",
	'{}'::jsonb,
	'{}'::jsonb,
	now()
FROM refunds_by_guild AS refund
ON CONFLICT ("guild_id") DO UPDATE
	SET "gold" = "v2_guild_resources"."gold" + EXCLUDED."gold",
		"updated_at" = now();
