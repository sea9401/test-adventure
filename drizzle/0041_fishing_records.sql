CREATE TABLE "fishing_records" (
	"user_id" text NOT NULL,
	"season_id" text NOT NULL,
	"fish_id" text NOT NULL,
	"best_size" double precision NOT NULL,
	"caught_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fishing_records_user_id_season_id_fish_id_pk" PRIMARY KEY("user_id","season_id","fish_id")
);
--> statement-breakpoint
ALTER TABLE "fishing_records" ADD CONSTRAINT "fishing_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fishing_records_leaderboard_idx" ON "fishing_records" USING btree ("season_id","fish_id","best_size" DESC);