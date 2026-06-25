-- Custom SQL migration file, put your code below! --

-- [공성 개편] 성벽 HP 를 단계(tier)별로 — 개척마을 300 / 마을 500 / 도시 1000 / 대도시 1500.
--   기존 점령지(타일)의 fort_max_hp/fort_hp 를 현재 정착지 단계에 맞춰 풀수리 갱신.
--   카탈로그(비-타일) 거점은 무접촉(ELSE 분기로 현행 유지). 🔒 멱등: 같은 값이면 무변.
UPDATE outpost_occupations o
SET fort_max_hp = CASE ts.tier
      WHEN 'frontier' THEN 300
      WHEN 'village' THEN 500
      WHEN 'city' THEN 1000
      WHEN 'metropolis' THEN 1500
      ELSE o.fort_max_hp END,
    fort_hp = CASE ts.tier
      WHEN 'frontier' THEN 300
      WHEN 'village' THEN 500
      WHEN 'city' THEN 1000
      WHEN 'metropolis' THEN 1500
      ELSE o.fort_hp END,
    fort_updated_at = now()
FROM tile_settlements ts
WHERE o.outpost_id = 'tile:' || ts.col || ',' || ts.row;
