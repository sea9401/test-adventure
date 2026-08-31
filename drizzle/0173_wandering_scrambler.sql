CREATE TABLE "codex_research_progress" (
	"user_id" text NOT NULL,
	"season_id" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"objective_progress" jsonb DEFAULT '{"objectives":{},"diversityEntries":{},"recordValues":{}}'::jsonb NOT NULL,
	"objective_completed_count" integer DEFAULT 0 NOT NULL,
	"diversity_score" integer DEFAULT 0 NOT NULL,
	"record_score" integer DEFAULT 0 NOT NULL,
	"score_reached_at" timestamp,
	"final_rank" integer,
	"final_tier" text,
	"representative_record" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "codex_research_progress_user_id_season_id_pk" PRIMARY KEY("user_id","season_id"),
	CONSTRAINT "codex_research_progress_score_valid" CHECK ("codex_research_progress"."score" >= 0 AND "codex_research_progress"."score" <= 20000),
	CONSTRAINT "codex_research_progress_objectives_valid" CHECK ("codex_research_progress"."objective_completed_count" >= 0 AND "codex_research_progress"."objective_completed_count" <= 18),
	CONSTRAINT "codex_research_progress_diversity_valid" CHECK ("codex_research_progress"."diversity_score" >= 0 AND "codex_research_progress"."diversity_score" <= 5000),
	CONSTRAINT "codex_research_progress_record_valid" CHECK ("codex_research_progress"."record_score" >= 0 AND "codex_research_progress"."record_score" <= 3000),
	CONSTRAINT "codex_research_progress_components_valid" CHECK ("codex_research_progress"."score" >= "codex_research_progress"."diversity_score" + "codex_research_progress"."record_score"
        AND "codex_research_progress"."score" <= "codex_research_progress"."diversity_score" + "codex_research_progress"."record_score" + 12000),
	CONSTRAINT "codex_research_progress_reached_at_valid" CHECK (("codex_research_progress"."score" = 0 AND "codex_research_progress"."score_reached_at" IS NULL)
        OR ("codex_research_progress"."score" > 0 AND "codex_research_progress"."score_reached_at" IS NOT NULL)),
	CONSTRAINT "codex_research_progress_final_rank_valid" CHECK ("codex_research_progress"."final_rank" IS NULL OR "codex_research_progress"."final_rank" >= 1),
	CONSTRAINT "codex_research_progress_final_tier_valid" CHECK ("codex_research_progress"."final_tier" IS NULL OR "codex_research_progress"."final_tier" IN ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary'))
);
--> statement-breakpoint
CREATE TABLE "codex_research_seasons" (
	"season_id" text PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"definition_snapshot" jsonb NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "codex_research_seasons_status_valid" CHECK ("codex_research_seasons"."status" IN ('scheduled', 'active', 'settling', 'closed')),
	CONSTRAINT "codex_research_seasons_window_valid" CHECK ("codex_research_seasons"."end_at" > "codex_research_seasons"."start_at")
);
--> statement-breakpoint
ALTER TABLE "codex_research_progress" ADD CONSTRAINT "codex_research_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_research_progress" ADD CONSTRAINT "codex_research_progress_season_id_codex_research_seasons_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."codex_research_seasons"("season_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codex_research_progress_season_score_rank_idx" ON "codex_research_progress" USING btree ("season_id","score" DESC NULLS LAST,"objective_completed_count" DESC NULLS LAST,"diversity_score" DESC NULLS LAST,"record_score" DESC NULLS LAST,"score_reached_at","user_id");--> statement-breakpoint
CREATE INDEX "codex_research_seasons_window_idx" ON "codex_research_seasons" USING btree ("status","start_at","end_at");