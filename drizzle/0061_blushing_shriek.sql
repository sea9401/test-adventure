ALTER TABLE "outpost_villages" ADD COLUMN "unlocked_slots" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- 기존 마을 백필 — 옛 고정 슬롯 모델(SLOTS_BY_TIER village 1·city 2·metropolis 4)을 해금 칸 수로
--   이관. 새 컬럼은 1 로 채워졌으니 도시/대도시만 보정(진행 중 슬롯이 잠겨 숨는 사고 방지).
UPDATE "outpost_villages" SET "unlocked_slots" = 2 WHERE "tier" = 'city';--> statement-breakpoint
UPDATE "outpost_villages" SET "unlocked_slots" = 4 WHERE "tier" = 'metropolis';
