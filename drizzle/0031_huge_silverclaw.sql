ALTER TABLE "outpost_occupations" ADD COLUMN "next_attack_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
-- 기존 점령자에게 24h 안정 기간 부여 — migration 직후 전원 즉시 due 방지.
-- 새 점령은 claim 시 tier interval 으로 정확히 설정.
UPDATE "outpost_occupations" SET "next_attack_at" = now() + interval '24 hours';--> statement-breakpoint
-- cron 의 due 검색 효율 (WHERE next_attack_at <= now AND occupied_by_user_id IS NOT NULL).
CREATE INDEX "outpost_occupations_next_attack_at_idx" ON "outpost_occupations" ("next_attack_at");
