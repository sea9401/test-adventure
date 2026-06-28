-- Custom SQL migration file, put your code below! --

-- Deprecated/no-op.
--
-- 이 마이그레이션은 예전 "평생 레벨 합계(character.v2.totalLevels)" 랭킹 보존용으로
-- 작성됐지만, 현재 성장 구조는 총 숙련도(proficiency.v2 groups/jobCumLevel) 기준이다.
-- 새 환경에서 totalLevels 를 다시 시드하지 않도록 비워 둔다.
