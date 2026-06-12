-- 침입자 추적 JSON path 조회 인덱스 (2026-06-12) — "부하 측정 후 후속"으로 미뤄둔 부채 청산.
--
-- intruders GET · war/overview(내 길드 침입자 카운트) · 토벌 탭이 전부
--   saves_kv WHERE key='character.v2' AND value->'lastHuntedOutpost'->>'outpostId' = $1
-- 형태의 JSON path 풀스캔이었다. 토벌 탭(#684)이 보유 거점마다 이 쿼리를 치면서 호출
-- 빈도가 늘어 expression + partial index 로 커버한다.
--   * partial 의 IS NOT NULL: 침입 추적이 없는 대다수 캐릭 행을 인덱스에서 제외(소형 유지).
--   * intruders GET 의 등호 조회·war/overview 의 IN 조회 모두 이 표현식과 일치.
CREATE INDEX IF NOT EXISTS "saves_kv_last_hunted_outpost_idx"
  ON "saves_kv" (((value -> 'lastHuntedOutpost') ->> 'outpostId'))
  WHERE "key" = 'character.v2'
    AND ((value -> 'lastHuntedOutpost') ->> 'outpostId') IS NOT NULL;
