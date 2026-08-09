-- 독술 계보 패시브를 맹독/부식으로 분리하면서, 이미 부식을 배운 캐릭터가
-- 같은 직업을 다시 방문하지 않아도 대응 맹독을 학습한 상태가 되게 한다.
-- 기존 장착·프리셋·정렬은 건드리지 않고 learned 배열 끝에 누락된 맹독만
-- 단계 순서대로 추가한다. 이미 모두 지급된 행은 갱신하지 않아 재실행에 안전하다.
WITH "backfill_candidates" AS (
	SELECT
		"skills"."user_id",
		COALESCE(
			(
				SELECT jsonb_agg(to_jsonb("mapping"."new_id") ORDER BY "mapping"."ordinal")
				FROM (
					VALUES
						('v2c_venomist_corrosion', 'v2c_venomist_virulence', 1),
						('v2c_venomancer_corrosion3', 'v2c_venomancer_virulence2', 2),
						('v2c_venomlord_sovereign', 'v2c_venomlord_virulence3', 3),
						('v2c_plaguebringer_decay', 'v2c_plaguebringer_virulence4', 4)
				) AS "mapping"("old_id", "new_id", "ordinal")
				WHERE ("skills"."value" -> 'learned') ? "mapping"."old_id"
					AND NOT (("skills"."value" -> 'learned') ? "mapping"."new_id")
			),
			'[]'::jsonb
		) AS "missing"
	FROM "saves_kv" AS "skills"
	WHERE "skills"."key" = 'skills.v2'
		AND jsonb_typeof("skills"."value" -> 'learned') = 'array'
)
UPDATE "saves_kv" AS "skills"
SET
	"value" = jsonb_set(
		"skills"."value",
		'{learned}',
		("skills"."value" -> 'learned') || "candidate"."missing",
		true
	),
	"version" = "skills"."version" + 1,
	"updated_at" = now()
FROM "backfill_candidates" AS "candidate"
WHERE "skills"."user_id" = "candidate"."user_id"
	AND "skills"."key" = 'skills.v2'
	AND jsonb_array_length("candidate"."missing") > 0;
