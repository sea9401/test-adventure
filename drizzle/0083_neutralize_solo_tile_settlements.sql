-- Custom SQL migration file, put your code below! --

-- 영토=길드 소유 일원화(PR3) — 기존 무소속(솔로) 타일 정착지를 중립화(빈 땅).
--   솔로 점령행 = occupied_by_guild_id IS NULL AND outpost_id LIKE 'tile:%'.
--   PR1(취득 길드 필수)·PR2(탈퇴=길드 잔류·해산=중립화) 이후 솔로 점령행은 더 생기지 않으므로,
--   남은 기존 솔로 정착지를 일괄 정리한다: 연관 행(거점 금고/수비큐/영주) + 정착지 행 + 점령행.
--   그 칸은 빈 땅이 되어 길드가 다시 개척할 수 있다.
--   🔒 멱등: 대상이 없으면 0행(재실행 안전). 카탈로그 거점·길드 소유 타일은 무접촉.

-- 1) 연관 행(거점 금고/수비큐/영주) — 솔로 타일 점령행 기준.
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

-- 2) 정착지(물리) 행 — 솔로 타일 점령행의 (col,row) 매칭.
DELETE FROM tile_settlements ts WHERE EXISTS (
  SELECT 1 FROM outpost_occupations o
  WHERE o.occupied_by_guild_id IS NULL
    AND o.outpost_id = 'tile:' || ts.col || ',' || ts.row
);

-- 3) 마지막으로 솔로 점령행 제거.
DELETE FROM outpost_occupations
WHERE occupied_by_guild_id IS NULL AND outpost_id LIKE 'tile:%';
