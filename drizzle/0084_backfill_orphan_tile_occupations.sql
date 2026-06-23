-- Custom SQL migration file, put your code below! --

-- 고아 타일 정착지 복구 — tile_settlements 행은 있는데 점령행(outpost_occupations)이 없는
--   "고아" 정착지에 점령행을 backfill 한다. (레거시 데이터 정합 — found/demolish/정복은 이미
--   점령행을 짝으로 만들고 지우므로 진행 중 재발원은 없음. 일회성 정리.)
--
-- 증상: 본인/길드가 세운 정착지 거점 화면에서 소유 인식이 안 돼 "점령 시도"가 뜸(occupation null).
--   영토=길드 소유 모델은 모든 타일 정착지에 길드 점령행을 전제.
--
-- 소유 결정: 점령행 occupied_by_guild_id = founder(tile_settlements.user_id)의 현재 길드.
--   founder 가 무소속이면 NULL → 아래 중립화 단계가 그 정착지를 빈 땅으로 제거(길드 소유 모델 정합·0083 동일).
--   fort/세율/유예는 0080(솔로 백필)과 동일: fort 100·tax 0.100·정책 open·protected 1h.
--   🔒 멱등: 이미 점령행 있으면 NOT EXISTS 로 스킵(0행). 카탈로그 거점 무접촉(tile_settlements 한정).

INSERT INTO outpost_occupations
  (outpost_id, occupied_by_user_id, occupied_by_guild_id, occupied_at,
   policy, tax_rate, next_attack_at, fort_hp, fort_max_hp, fort_updated_at, protected_until)
SELECT
  'tile:' || ts.col || ',' || ts.row,
  ts.user_id,
  (SELECT gm.guild_id FROM guild_members gm WHERE gm.user_id = ts.user_id LIMIT 1),
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

-- founder 무소속 → 위에서 occupied_by_guild_id = NULL 로 들어간 행을 중립화(빈 땅). 0083 과 동일.
DELETE FROM outpost_treasury WHERE outpost_id IN (
  SELECT outpost_id FROM outpost_occupations
  WHERE occupied_by_guild_id IS NULL AND outpost_id LIKE 'tile:%'
);
DELETE FROM outpost_defenders WHERE outpost_id IN (
  SELECT outpost_id FROM outpost_occupations
  WHERE occupied_by_guild_id IS NULL AND outpost_id LIKE 'tile:%'
);
DELETE FROM outpost_lords WHERE outpost_id IN (
  SELECT outpost_id FROM outpost_occupations
  WHERE occupied_by_guild_id IS NULL AND outpost_id LIKE 'tile:%'
);
DELETE FROM tile_settlements ts WHERE EXISTS (
  SELECT 1 FROM outpost_occupations o
  WHERE o.occupied_by_guild_id IS NULL
    AND o.outpost_id = 'tile:' || ts.col || ',' || ts.row
);
DELETE FROM outpost_occupations
WHERE occupied_by_guild_id IS NULL AND outpost_id LIKE 'tile:%';
