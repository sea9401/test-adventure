ALTER TABLE "referral_conversions" ALTER COLUMN "reward_gold" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD COLUMN "rewarded_depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- 기존 실적은 가입 시 이미 전액 지급됐다. 최종 단계 완료로 표시해 새 단계 보상이
-- 중복 지급되지 않게 한 뒤 신규 귀속부터 기본값 0을 사용한다.
UPDATE "referral_conversions" SET "rewarded_depth" = 36;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_rewarded_depth_check" CHECK ("referral_conversions"."rewarded_depth" in (0, 12, 24, 36));
