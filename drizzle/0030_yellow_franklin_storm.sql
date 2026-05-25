ALTER TABLE "outpost_occupations" ADD COLUMN "last_harvested_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
-- 기존 점령자의 누적 시간 보존 — last_harvested_at 을 점령 시점(occupied_at) 으로 backfill.
-- ALTER 의 DEFAULT now() 가 모든 기존 row 에 now() 박힌 후 UPDATE 가 occupied_at 으로 덮어씀.
UPDATE "outpost_occupations" SET "last_harvested_at" = "occupied_at";
