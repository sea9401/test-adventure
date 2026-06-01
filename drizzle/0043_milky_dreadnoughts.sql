CREATE TABLE "treasure_scores" (
	"user_id" text NOT NULL,
	"season_id" text NOT NULL,
	"total_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "treasure_scores_user_id_season_id_pk" PRIMARY KEY("user_id","season_id")
);
--> statement-breakpoint
CREATE TABLE "treasure_seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"rewards_granted_at" timestamp,
	"winners" integer DEFAULT 0 NOT NULL,
	"total_coins" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "treasure_scores" ADD CONSTRAINT "treasure_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "treasure_scores_leaderboard_idx" ON "treasure_scores" USING btree ("season_id","total_value" DESC);