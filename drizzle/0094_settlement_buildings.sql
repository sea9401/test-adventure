-- Custom SQL migration file, put your code below! --

-- 마을별 1슬롯 영지 건축물 배치 상태.
-- { "0":"guild_smithy" } 형태로 저장한다. 기존 마을은 빈 건축물 슬롯으로 시작한다.
ALTER TABLE "outpost_villages"
  ADD COLUMN "buildings" jsonb DEFAULT '{}'::jsonb NOT NULL;
