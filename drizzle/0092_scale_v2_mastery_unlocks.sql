-- Custom SQL migration file, put your code below! --

-- v2 숙련도 해금선 1.5배 상향 보정.
--
-- 2026-06-28: 숙련도가 사냥 승리당 +1 이라 빠른 전투 기준 요구치가 낮게 체감되어
-- 해금선을 600/1200/1800 → 900/1800/2700 으로 올렸다. 기존 유저의 해금 상태가
-- 갑자기 잠기지 않도록 proficiency.v2 의 groups.cumLevel 과 jobCumLevel 도 같은 비율(×1.5)로
-- 보정한다.
--
-- 멱등: masteryScaleVersion >= 2 이면 스킵. 값이 없거나 0/1인 row 만 보정한다.

UPDATE "saves_kv" pr
SET "value" = jsonb_set(
  jsonb_set(
    jsonb_set(
      pr."value",
      '{groups}',
      CASE
        WHEN jsonb_typeof(pr."value"->'groups') = 'object' THEN
          COALESCE((
            SELECT jsonb_object_agg(
              g.key,
              CASE
                WHEN jsonb_typeof(g.value) = 'object'
                  AND (g.value->>'cumLevel') ~ '^[0-9]+$'
                THEN jsonb_set(
                  g.value,
                  '{cumLevel}',
                  to_jsonb(CEIL(((g.value->>'cumLevel')::numeric) * 1.5)::int),
                  true
                )
                ELSE g.value
              END
            )
            FROM jsonb_each(pr."value"->'groups') AS g
          ), '{}'::jsonb)
        ELSE COALESCE(pr."value"->'groups', '{}'::jsonb)
      END,
      true
    ),
    '{jobCumLevel}',
    CASE
      WHEN jsonb_typeof(pr."value"->'jobCumLevel') = 'object' THEN
        COALESCE((
          SELECT jsonb_object_agg(
            j.key,
            CASE
              WHEN (j.value #>> '{}') ~ '^[0-9]+$'
              THEN to_jsonb(CEIL(((j.value #>> '{}')::numeric) * 1.5)::int)
              ELSE j.value
            END
          )
          FROM jsonb_each(pr."value"->'jobCumLevel') AS j
        ), '{}'::jsonb)
      ELSE COALESCE(pr."value"->'jobCumLevel', '{}'::jsonb)
    END,
    true
  ),
  '{masteryScaleVersion}',
  '2'::jsonb,
  true
)
WHERE pr."key" = 'proficiency.v2'
  AND (
    CASE
      WHEN (pr."value"->>'masteryScaleVersion') ~ '^[0-9]+$'
      THEN (pr."value"->>'masteryScaleVersion')::int
      ELSE 0
    END
  ) < 2;
