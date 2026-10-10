CREATE TABLE "life_festival_scores" (
	"user_id" text NOT NULL,
	"week_id" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"deliveries" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "life_festival_scores_user_id_week_id_pk" PRIMARY KEY("user_id","week_id")
);
--> statement-breakpoint
CREATE TABLE "life_festival_weeks" (
	"id" text PRIMARY KEY NOT NULL,
	"rewards_granted_at" timestamp,
	"winners" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "life_festival_scores" ADD CONSTRAINT "life_festival_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "life_festival_scores_rank_idx" ON "life_festival_scores" USING btree ("week_id","score" DESC);