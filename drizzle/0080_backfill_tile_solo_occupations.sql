-- Custom SQL migration file, put your code below! --

-- 솔로 타일 점령행 백필 — 개인(무길드) 정착지도 정복 가능한 전쟁 대상으로 만든다.
--   점령행(outpost_occupations)이 없는 모든 타일 정착지에 "솔로 점령행"을 생성한다.
--   점령행이 없는 타일 = 솔로로 founded 된 타일(길드 found 분기는 항상 점령행을 만든다).
--   → 전부 occupied_by_guild_id = NULL(솔로 소유) + occupied_by_user_id = 주인 으로 백필.
--   fort/세율은 buildTileOccupationValues(신규 found)와 동일: fort 풀(100)·tax 0.100·정책 open.
--   protected_until = now() + 1h 유예 → 백필 직후 즉시 함락 방지.
--   next_attack_at = 미래(무관): tile id 는 NPC 크론이 resolveOutpostMeta(tier 미주입)=undefined
--     로 스킵하므로 값이 동작에 영향 없음.
--   🔒 멱등: NOT EXISTS 가드 — 2회 실행해도 이미 점령행 있어 0행.
INSERT INTO outpost_occupations
  (outpost_id, occupied_by_user_id, occupied_by_guild_id, occupied_at,
   policy, tax_rate, next_attack_at, fort_hp, fort_max_hp, fort_updated_at, protected_until)
SELECT
  'tile:' || ts.col || ',' || ts.row,
  ts.user_id,
  NULL::integer,
  now(),
  'open',
  '0.100',
  now() + interval '24 hours',
  100,
  100,
  now(),
  now() + interval '1 hour'
FROM tile_settlements ts
WHERE NOT EXISTS (
  SELECT 1 FROM outpost_occupations o
  WHERE o.outpost_id = 'tile:' || ts.col || ',' || ts.row
);
