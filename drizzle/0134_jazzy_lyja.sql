ALTER TABLE "lottery_purchases" DROP CONSTRAINT "lottery_purchases_amount_check";--> statement-breakpoint
ALTER TABLE "lottery_purchases" ADD COLUMN "is_carried" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lottery_purchases" ADD CONSTRAINT "lottery_purchases_amount_check" CHECK ("lottery_purchases"."amount_paid" >= 0);--> statement-breakpoint
ALTER TABLE "pvp_tournament_bets" DROP CONSTRAINT "pvp_tournament_bets_amount_valid";--> statement-breakpoint
ALTER TABLE "pvp_tournament_bets" ADD CONSTRAINT "pvp_tournament_bets_amount_valid" CHECK ("pvp_tournament_bets"."amount" BETWEEN 100 AND 1500000);
