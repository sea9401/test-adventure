-- Custom SQL migration file, put your code below! --

-- 평생 누적 레벨(character.v2.totalLevels) 시드 — totalLevels 가 없는 기존 유저를 "현재 누적 레벨
--   랭킹값"으로 채운다: GREATEST( proficiency.v2 모든 직군 cumLevel 합, 현재 레벨 ). 이러면 마이그
--   직후 랭킹 순위가 그대로 보존되고, 이후 레벨업마다 코드가 totalLevels 를 정확히 누적한다
--   (모험가 포함·환생/전직 리셋 무관). 랭킹은 totalLevels 있으면 그걸, 없으면 같은 공식으로 폴백.
--
-- 🔒 멱등: totalLevels 가 이미 있으면 스킵(WHERE ... IS NULL). prof 없는 유저는 현재 레벨로 시드.
--   cumLevel 은 항상 음 아닌 정수(posInt)라 ^[0-9]+$ 가드로 비정수 1행이 쿼리를 터뜨리는 것 방지.
--   jsonb_each 는 입력이 null 이면 빈 집합(prof/groups 없으면 합 0). 랭킹 라우트와 동일 파생식.

UPDATE "saves_kv" c
SET "value" = jsonb_set(
  c."value",
  '{totalLevels}',
  to_jsonb(
    GREATEST(
      COALESCE((
        SELECT SUM((g.value->>'cumLevel')::int)
        FROM jsonb_each(
          (SELECT pr."value"->'groups'
           FROM "saves_kv" pr
           WHERE pr."user_id" = c."user_id" AND pr."key" = 'proficiency.v2')
        ) AS g
        WHERE (g.value->>'cumLevel') ~ '^[0-9]+$'
      ), 0),
      COALESCE(NULLIF(c."value"->>'level', '')::int, 1)
    )
  ),
  true
)
WHERE c."key" = 'character.v2'
  AND (c."value"->>'totalLevels') IS NULL;
