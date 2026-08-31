-- 피드백 #229 조사 결과, 대상 계정은 SP 열매 III를 총 5개 획득했지만
-- 현재 사용 3개·보유 0개로 2개가 누락된 정황이 확인됐다.
-- 누락분 2개를 character.v2.materials에 복구하고 보정 원장을 남긴다.
--
-- economy_events의 sourceMigration을 멱등 키로 사용한다. 원장이 새로 생성된
-- 경우에만 재료를 합산하므로 마이그레이션이 재실행돼도 중복 지급하지 않는다.
WITH target_user AS (
	SELECT "id"
	FROM "users"
	WHERE "id" = '1741c7b6-748e-4040-8a27-35d9d776f015'
		AND "email" = 'kakao_5018817029@kakao.oauth'
),
new_compensation_event AS (
	INSERT INTO "economy_events" (
		"user_id",
		"event_type",
		"gold_delta",
		"item_kind",
		"item_id",
		"quantity",
		"detail"
	)
	SELECT
		"id",
		'admin.reward.compensate',
		0,
		'material',
		'sp_fruit_3',
		2,
		jsonb_build_object(
			'reason', 'feedback_229_missing_sp_fruit_3',
			'sourceMigration', '0160_restore_sp_fruit_3_feedback_229'
		)
	FROM target_user
	WHERE NOT EXISTS (
		SELECT 1
		FROM "economy_events" AS existing
		WHERE existing."event_type" = 'admin.reward.compensate'
			AND existing."detail" ->> 'sourceMigration' =
				'0160_restore_sp_fruit_3_feedback_229'
	)
	RETURNING "user_id", "quantity"
)
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
	jsonb_build_object(
		'materials',
		jsonb_build_object('sp_fruit_3', "quantity")
	),
	1,
	now()
FROM new_compensation_event
ON CONFLICT ("user_id", "key") DO UPDATE
SET
	"value" = jsonb_set(
		CASE
			WHEN jsonb_typeof("saves_kv"."value") = 'object' THEN "saves_kv"."value"
			ELSE '{}'::jsonb
		END,
		'{materials}',
		jsonb_set(
			CASE
				WHEN jsonb_typeof("saves_kv"."value" -> 'materials') = 'object'
					THEN "saves_kv"."value" -> 'materials'
				ELSE '{}'::jsonb
			END,
			'{sp_fruit_3}',
			to_jsonb(
				CASE
					WHEN ("saves_kv"."value" -> 'materials' ->> 'sp_fruit_3') ~
						'^[-]?[0-9]+([.][0-9]+)?$'
						THEN GREATEST(
							0,
							floor(("saves_kv"."value" -> 'materials' ->> 'sp_fruit_3')::numeric)
						)
					ELSE 0
				END + (EXCLUDED."value" -> 'materials' ->> 'sp_fruit_3')::numeric
			),
			true
		),
		true
	),
	"version" = "saves_kv"."version" + 1,
	"updated_at" = now();
