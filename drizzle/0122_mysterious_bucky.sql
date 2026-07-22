ALTER TABLE "lottery_rounds" DROP CONSTRAINT "lottery_rounds_status_check";--> statement-breakpoint
ALTER TABLE "lottery_rounds" ADD COLUMN "carry_in" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lottery_rounds" ADD CONSTRAINT "lottery_rounds_carry_in_check" CHECK ("lottery_rounds"."carry_in" >= 0);--> statement-breakpoint
ALTER TABLE "lottery_rounds" ADD CONSTRAINT "lottery_rounds_status_check" CHECK ("lottery_rounds"."status" IN ('open','settled','refunded','rolled_over'));