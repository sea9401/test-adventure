-- 직업 숙련도 게이트를 제거하고 숙달 포인트 비용을 인상하기 전에 진행한
-- 모든 스킬 강화 의식을 초기화하고, 당시 실제로 납부한 골드와 숙달 포인트를 전액 환급한다.
--
-- 기존 누적 비용(단계별):
--   +1 =  1,000,000G /    300 숙달
--   +2 =  4,000,000G /  1,100 숙달
--   +3 = 12,000,000G /  2,900 숙달
--   +4 = 32,000,000G /  6,900 숙달
--   +5 = 82,000,000G / 15,900 숙달
--
-- 숫자형 레거시와 { mode, level } 객체형을 모두 지원한다. 환급 성공 뒤
-- enhancements 키를 제거하므로 재실행해도 같은 강화분을 중복 환급하지 않는다.
WITH raw_enhancements AS (
	SELECT
		"skills"."user_id",
		"enhancement"."key" AS "skill_id",
		CASE jsonb_typeof("enhancement"."value")
			WHEN 'number' THEN "enhancement"."value" #>> '{}'
			WHEN 'object' THEN "enhancement"."value" ->> 'level'
			ELSE NULL
		END AS "raw_level"
	FROM "saves_kv" AS "skills"
	CROSS JOIN LATERAL jsonb_each("skills"."value" -> 'enhancements') AS "enhancement"
	WHERE "skills"."key" = 'skills.v2'
		AND jsonb_typeof("skills"."value" -> 'enhancements') = 'object'
),
normalized_enhancements AS (
	SELECT
		"user_id",
		"skill_id",
		LEAST(5, GREATEST(0, floor("raw_level"::numeric)::integer)) AS "level"
	FROM raw_enhancements
	WHERE "raw_level" ~ '^[0-9]+([.][0-9]+)?$'
),
refunds AS (
	SELECT
		"user_id",
		SUM(
			CASE "level"
				WHEN 1 THEN 1000000
				WHEN 2 THEN 4000000
				WHEN 3 THEN 12000000
				WHEN 4 THEN 32000000
				WHEN 5 THEN 82000000
				ELSE 0
			END
		)::bigint AS "refund_gold",
		SUM(
			CASE "level"
				WHEN 1 THEN 300
				WHEN 2 THEN 1100
				WHEN 3 THEN 2900
				WHEN 4 THEN 6900
				WHEN 5 THEN 15900
				ELSE 0
			END
		)::bigint AS "refund_proficiency"
	FROM normalized_enhancements
	WHERE "level" BETWEEN 1 AND 5
	GROUP BY "user_id"
),
refunded_characters AS (
	INSERT INTO "saves_kv" (
		"user_id",
		"key",
		"value",
		"version",
		"updated_at"
	)
	SELECT
		"user_id",
		'character.v2',
		jsonb_build_object('gold', "refund_gold"),
		1,
		now()
	FROM refunds
	ON CONFLICT ("user_id", "key") DO UPDATE
	SET
		"value" = jsonb_set(
			CASE
				WHEN jsonb_typeof("saves_kv"."value") = 'object' THEN "saves_kv"."value"
				ELSE '{}'::jsonb
			END,
			'{gold}',
			to_jsonb(
				CASE
					WHEN ("saves_kv"."value" ->> 'gold') ~ '^-?[0-9]+([.][0-9]+)?$'
						THEN GREATEST(0, floor(("saves_kv"."value" ->> 'gold')::numeric))
					ELSE 0
				END + (EXCLUDED."value" ->> 'gold')::numeric
			),
			true
		),
		"version" = "saves_kv"."version" + 1,
		"updated_at" = now()
	RETURNING "user_id"
),
refunded_proficiencies AS (
	INSERT INTO "saves_kv" (
		"user_id",
		"key",
		"value",
		"version",
		"updated_at"
	)
	SELECT
		"refund"."user_id",
		'proficiency.v2',
		jsonb_build_object('points', "refund"."refund_proficiency"),
		1,
		now()
	FROM refunds AS "refund"
	INNER JOIN refunded_characters AS "character"
		ON "character"."user_id" = "refund"."user_id"
	ON CONFLICT ("user_id", "key") DO UPDATE
	SET
		"value" = jsonb_set(
			CASE
				WHEN jsonb_typeof("saves_kv"."value") = 'object' THEN "saves_kv"."value"
				ELSE '{}'::jsonb
			END,
			'{points}',
			to_jsonb(
				CASE
					WHEN ("saves_kv"."value" ->> 'points') ~ '^-?[0-9]+([.][0-9]+)?$'
						THEN GREATEST(0, floor(("saves_kv"."value" ->> 'points')::numeric))
					ELSE 0
				END + (EXCLUDED."value" ->> 'points')::numeric
			),
			true
		),
		"version" = "saves_kv"."version" + 1,
		"updated_at" = now()
	RETURNING "user_id"
)
UPDATE "saves_kv" AS "skills"
SET
	"value" = "skills"."value" - 'enhancements',
	"version" = "skills"."version" + 1,
	"updated_at" = now()
FROM refunds AS "refund"
INNER JOIN refunded_characters AS "character"
	ON "character"."user_id" = "refund"."user_id"
INNER JOIN refunded_proficiencies AS "proficiency"
	ON "proficiency"."user_id" = "refund"."user_id"
WHERE "skills"."user_id" = "refund"."user_id"
	AND "skills"."key" = 'skills.v2'
	AND jsonb_typeof("skills"."value" -> 'enhancements') = 'object';
