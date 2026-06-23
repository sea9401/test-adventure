-- Custom SQL migration file, put your code below! --

-- 타일 생산 관리 T3b 백필 — 옛 단순 promote 로 frontier 위 단계가 된 타일 정착지를
-- 생산 시스템(outpost_villages)에 비파괴 편입한다. V2_TILE_PRODUCTION flip 과 같은 배포.
--   대상: tile_settlements.tier <> 'frontier' 인데 그 타일의 outpost_villages 행이 없는 것.
--   소유: 점령행(outpost_occupations) 있으면 길드, 없으면 founder(=솔로).
--   tier: 그대로(village/city/metropolis). 슬롯: 그 단계 상한까지 해금(이어서 생산/승격 가능).
--   name: 정착지 이름(있으면) — name 이 set 이어야 "건설됨"(미설정=건설 폼) 으로 인식된다.
--   slot_kinds/jobs: 빈 상태({}) — 종류는 플레이어가 칸마다 고른다.
INSERT INTO outpost_villages
  (outpost_id, guild_id, owner_user_id, tier, name, production_kind, unlocked_slots, slot_kinds, jobs)
SELECT
  'tile:' || ts.col || ',' || ts.row,
  occ.occupied_by_guild_id,
  CASE WHEN occ.occupied_by_guild_id IS NULL THEN ts.user_id ELSE NULL END,
  ts.tier,
  COALESCE(ts.name, '개척 정착지'),
  NULL,
  CASE ts.tier WHEN 'metropolis' THEN 9 WHEN 'city' THEN 9 WHEN 'village' THEN 4 ELSE 1 END,
  '{}'::jsonb,
  '{}'::jsonb
FROM tile_settlements ts
LEFT JOIN outpost_occupations occ
  ON occ.outpost_id = 'tile:' || ts.col || ',' || ts.row
WHERE ts.tier <> 'frontier'
  AND NOT EXISTS (
    SELECT 1 FROM outpost_villages ov
    WHERE ov.outpost_id = 'tile:' || ts.col || ',' || ts.row
  );
