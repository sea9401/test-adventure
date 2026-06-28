-- Custom SQL migration file, put your code below! --

-- v2 숙련도 스케일 보정.
--
-- 2026-06-28: 직업 해금 입력(cumLevel/jobCumLevel)의 의미를 "레벨업 누적"에서
-- "사냥 승리 누적 숙련도"로 바꿨고, 해금선도 100/200/300 → 600/1200/1800 으로 6배 상향했다.
-- 기존 유저의 해금 상태가 갑자기 잠기지 않도록 기존 proficiency.v2 의 숫자를 같은 비율(×6)로
-- 보정한다. 이후 새 사냥 승리는 코드가 +1씩 더한다.
--
-- 멱등: masteryScaleVersion >= 1 이면 스킵. 값이 없거나 0인 레거시 row 만 보정한다.

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
                  to_jsonb(((g.value->>'cumLevel')::int) * 6),
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
              THEN to_jsonb(((j.value #>> '{}')::int) * 6)
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
  '1'::jsonb,
  true
)
WHERE pr."key" = 'proficiency.v2'
  AND (
    CASE
      WHEN (pr."value"->>'masteryScaleVersion') ~ '^[0-9]+$'
      THEN (pr."value"->>'masteryScaleVersion')::int
      ELSE 0
    END
  ) < 1;
