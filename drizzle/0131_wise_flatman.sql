ALTER TABLE "coupon_campaigns" DROP CONSTRAINT "coupon_campaigns_period_check";--> statement-breakpoint
ALTER TABLE "coupon_campaigns" ALTER COLUMN "ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coupon_campaigns" ADD CONSTRAINT "coupon_campaigns_period_check" CHECK ("coupon_campaigns"."ends_at" IS NULL OR "coupon_campaigns"."ends_at" > "coupon_campaigns"."starts_at");