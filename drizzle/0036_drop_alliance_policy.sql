-- v2 outpost 점령 정책에서 "alliance" 옵션 제거.
-- alliance 시스템 미구현 상태였고 hunt 가 무시했으므로 동작 변화 없음.
-- 기존 alliance row 는 모두 "open" 으로 이전 (가장 관대한 정책).
UPDATE "outpost_occupations" SET "policy" = 'open' WHERE "policy" = 'alliance';
