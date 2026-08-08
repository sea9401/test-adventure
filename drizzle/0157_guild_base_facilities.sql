-- 길드 시설 7종을 해금형 콘텐츠에서 모든 길드의 Lv.1 기본 기능으로 전환한다.
-- 기존 영지에 같은 시설이 이미 있으면 그 위치와 레벨을 보존하고 누락 시설만 채운다.
INSERT INTO "outpost_villages" (
	"outpost_id",
	"guild_id",
	"owner_user_id",
	"tier",
	"name",
	"production_kind",
	"unlocked_slots",
	"slot_kinds",
	"buildings",
	"jobs"
)
SELECT
	'guild-facility:' || guild_row."id" || ':' || facility."building_id",
	guild_row."id",
	NULL,
	'village',
	NULL,
	NULL,
	1,
	'{}'::jsonb,
	jsonb_build_object(
		'0',
		jsonb_build_object('id', facility."building_id", 'level', 1)
	),
	'{}'::jsonb
FROM "guilds" AS guild_row
CROSS JOIN (
	VALUES
		('guild_smithy'),
		('training_ground'),
		('exploration_hq'),
		('alchemy_workshop'),
		('dining_hall'),
		('trade_post'),
		('guild_warehouse')
) AS facility("building_id")
WHERE NOT EXISTS (
	SELECT 1
	FROM "outpost_villages" AS village
	CROSS JOIN LATERAL jsonb_each(
		CASE
			WHEN jsonb_typeof(village."buildings") = 'object'
				THEN village."buildings"
			ELSE '{}'::jsonb
		END
	) AS building_slot("slot", "building")
	WHERE village."guild_id" = guild_row."id"
		AND (
			building_slot."building" = to_jsonb(facility."building_id")
			OR building_slot."building" ->> 'id' = facility."building_id"
		)
)
ON CONFLICT ("outpost_id") DO NOTHING;
