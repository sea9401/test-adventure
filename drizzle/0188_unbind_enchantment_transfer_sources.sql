-- 마법부여 이전 원본은 마법부여가 빠진 뒤에도 귀속이 남아 거래할 수 없었다(건의 #758).
-- 장비 귀속은 마법부여에서만 생기므로, 마법부여 없이 귀속만 남은 장비 개체의 귀속을 푼다.
-- 마법부여가 남아 있는 장비와 장비가 아닌 항목은 건드리지 않으며, 대상이 없는 행은 갱신하지 않아
-- 재실행에 안전하다.
UPDATE "saves_kv" AS "equipment"
SET
	"value" = jsonb_set(
		"equipment"."value",
		'{owned}',
		(
			SELECT jsonb_agg(
				CASE
					WHEN jsonb_typeof("owned"."item") = 'object'
						AND "owned"."item" -> 'bound' = 'true'::jsonb
						AND jsonb_typeof("owned"."item" -> 'liberation') IS DISTINCT FROM 'object'
					THEN "owned"."item" - 'bound'
					ELSE "owned"."item"
				END
				ORDER BY "owned"."ordinal"
			)
			FROM jsonb_array_elements("equipment"."value" -> 'owned')
				WITH ORDINALITY AS "owned"("item", "ordinal")
		),
		true
	),
	"version" = "equipment"."version" + 1,
	"updated_at" = now()
WHERE "equipment"."key" = 'equipment.v2'
	AND jsonb_typeof("equipment"."value" -> 'owned') = 'array'
	AND EXISTS (
		SELECT 1
		FROM jsonb_array_elements("equipment"."value" -> 'owned') AS "owned"("item")
		WHERE jsonb_typeof("owned"."item") = 'object'
			AND "owned"."item" -> 'bound' = 'true'::jsonb
			AND jsonb_typeof("owned"."item" -> 'liberation') IS DISTINCT FROM 'object'
	);
