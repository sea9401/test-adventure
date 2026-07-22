CREATE TABLE "pvp_tournaments" (
	"season_id" text PRIMARY KEY NOT NULL,
	"bracket_size" integer NOT NULL,
	"status" text NOT NULL,
	"bracket" jsonb NOT NULL,
	"champion_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"rewards_granted_at" timestamp,
	CONSTRAINT "pvp_tournaments_status_valid" CHECK ("pvp_tournaments"."status" IN ('completed','not_enough_players'))
);
--> statement-breakpoint
ALTER TABLE "pvp_tournaments" ADD CONSTRAINT "pvp_tournaments_season_id_pvp_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."pvp_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pvp_tournaments" ADD CONSTRAINT "pvp_tournaments_champion_user_id_users_id_fk" FOREIGN KEY ("champion_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pvp_tournaments_created_at_idx" ON "pvp_tournaments" USING btree ("created_at");