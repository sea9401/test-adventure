CREATE TABLE "pvp_tournament_bets" (
	"season_id" text NOT NULL,
	"match_id" text NOT NULL,
	"user_id" text NOT NULL,
	"chosen_user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp,
	CONSTRAINT "pvp_tournament_bets_season_id_match_id_user_id_pk" PRIMARY KEY("season_id","match_id","user_id"),
	CONSTRAINT "pvp_tournament_bets_amount_valid" CHECK ("pvp_tournament_bets"."amount" BETWEEN 100 AND 50000),
	CONSTRAINT "pvp_tournament_bets_status_valid" CHECK ("pvp_tournament_bets"."status" IN ('pending','won','lost','refunded')),
	CONSTRAINT "pvp_tournament_bets_payout_valid" CHECK ("pvp_tournament_bets"."payout" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pvp_tournaments" DROP CONSTRAINT "pvp_tournaments_status_valid";--> statement-breakpoint
ALTER TABLE "pvp_tournaments" ADD COLUMN "snapshots" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pvp_tournament_bets" ADD CONSTRAINT "pvp_tournament_bets_season_id_pvp_tournaments_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."pvp_tournaments"("season_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_tournament_bets" ADD CONSTRAINT "pvp_tournament_bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pvp_tournament_bets_match_idx" ON "pvp_tournament_bets" USING btree ("season_id","match_id");--> statement-breakpoint
CREATE INDEX "pvp_tournament_bets_user_idx" ON "pvp_tournament_bets" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "pvp_tournaments" ADD CONSTRAINT "pvp_tournaments_status_valid" CHECK ("pvp_tournaments"."status" IN ('scheduled','in_progress','completed','not_enough_players'));