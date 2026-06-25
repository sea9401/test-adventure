-- Custom SQL migration file, put your code below! --

-- 고아 타일 정착지 복구 v2 — 0084 이후 새로 생긴 "고아"(점령행 outpost_occupations 가 없는
--   tile_settlements)에 점령행을 backfill 한다. 0084 는 일회성이라 그 이후 found 된 정착지는
--   못 잡는다.
--
-- 재발원: V2_TILE_WARFARE off 환경(예: 플래그 미설정 로컬 빌드)에서 found 하면 founding 라우트가
--   솔로 경로를 타 점령행을 만들지 않는다(공유 DB 면 고아가 prod 에도 보임). 증상: 길드원이 세운
--   개척마을이 모험 탭/거점 화면에서 "솔로 개척자"로 표기(occupied_by_guild_id 파생값 null).
--
-- 소유 결정: occupied_by_guild_id = founder(tile_settlements.user_id)의 현재 길드(guild_members).
--   ⚠️ 0084 와 달리 무소속 founder 의 정착지는 건드리지 않는다 — 중립화-삭제 단계 생략(비파괴).
--     길드가 있는 founder 의 고아만 backfill → 영토=길드 소유 모델 정합, 정착지 삭제 없음.
--   fort_hp = 0087 과 동일한 tier 값(개척마을 900 / 마을 1500 / 도시 3000 / 대도시 4500), 풀피.
--   🔒 멱등: 점령행이 이미 있으면 NOT EXISTS 로 스킵(0행). 카탈로그(비-tile) 거점 무접촉.

INSERT INTO outpost_occupations
  (outpost_id, occupied_by_user_id, occupied_by_guild_id, occupied_at,
   policy, tax_rate, next_attack_at, fort_hp, fort_max_hp, fort_updated_at, protected_until)
SELECT
  'tile:' || ts.col || ',' || ts.row,
  ts.user_id,
  (SELECT m.guild_id FROM guild_members m WHERE m.user_id = ts.user_id LIMIT 1),
  now(),
  'open',
  '0.100',
  now() + interval '24 hours',
  CASE ts.tier
    WHEN 'frontier' THEN 900
    WHEN 'village' THEN 1500
    WHEN 'city' THEN 3000
    WHEN 'metropolis' THEN 4500
    ELSE 900 END,
  CASE ts.tier
    WHEN 'frontier' THEN 900
    WHEN 'village' THEN 1500
    WHEN 'city' THEN 3000
    WHEN 'metropolis' THEN 4500
    ELSE 900 END,
  now(),
  now() + interval '1 hour'
FROM tile_settlements ts
WHERE NOT EXISTS (
    SELECT 1 FROM outpost_occupations o
    WHERE o.outpost_id = 'tile:' || ts.col || ',' || ts.row
  )
  -- 길드 있는 founder 의 고아만(무소속 founder 정착지는 스킵 — 비파괴, NULL 길드행 안 만듦).
  AND EXISTS (
    SELECT 1 FROM guild_members m WHERE m.user_id = ts.user_id
  );
