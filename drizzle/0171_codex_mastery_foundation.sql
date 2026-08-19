CREATE TABLE "codex_mastery_progress" (
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"entry_id" text NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	"best_value" double precision,
	"current_tier" text DEFAULT 'none' NOT NULL,
	"seal_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tier_achieved_at" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score_milli" bigint DEFAULT 0 NOT NULL,
	"first_recorded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "codex_mastery_progress_user_id_category_entry_id_pk" PRIMARY KEY("user_id","category","entry_id"),
	CONSTRAINT "codex_mastery_progress_count_nonnegative" CHECK ("codex_mastery_progress"."count" >= 0),
	CONSTRAINT "codex_mastery_progress_score_nonnegative" CHECK ("codex_mastery_progress"."score_milli" >= 0)
);
--> statement-breakpoint
CREATE TABLE "codex_mastery_summary" (
	"user_id" text PRIMARY KEY NOT NULL,
	"total_score_milli" bigint DEFAULT 0 NOT NULL,
	"equipment_score_milli" bigint DEFAULT 0 NOT NULL,
	"fish_score_milli" bigint DEFAULT 0 NOT NULL,
	"monster_score_milli" bigint DEFAULT 0 NOT NULL,
	"cooking_score_milli" bigint DEFAULT 0 NOT NULL,
	"life_score_milli" bigint DEFAULT 0 NOT NULL,
	"job_score_milli" bigint DEFAULT 0 NOT NULL,
	"bronze_count" integer DEFAULT 0 NOT NULL,
	"silver_count" integer DEFAULT 0 NOT NULL,
	"gold_count" integer DEFAULT 0 NOT NULL,
	"platinum_count" integer DEFAULT 0 NOT NULL,
	"diamond_count" integer DEFAULT 0 NOT NULL,
	"legendary_count" integer DEFAULT 0 NOT NULL,
	"seal_count" integer DEFAULT 0 NOT NULL,
	"scored_category_count" integer DEFAULT 0 NOT NULL,
	"score_reached_at" timestamp,
	"equipment_score_reached_at" timestamp,
	"fish_score_reached_at" timestamp,
	"monster_score_reached_at" timestamp,
	"cooking_score_reached_at" timestamp,
	"life_score_reached_at" timestamp,
	"job_score_reached_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codex_mastery_progress" ADD CONSTRAINT "codex_mastery_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_mastery_summary" ADD CONSTRAINT "codex_mastery_summary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codex_mastery_progress_user_category_tier_idx" ON "codex_mastery_progress" USING btree ("user_id","category","current_tier");--> statement-breakpoint
CREATE INDEX "codex_mastery_summary_total_score_rank_idx" ON "codex_mastery_summary" USING btree ("total_score_milli" DESC NULLS LAST,"gold_count" DESC NULLS LAST,"seal_count" DESC NULLS LAST,"scored_category_count" DESC NULLS LAST,"score_reached_at","user_id");--> statement-breakpoint
CREATE INDEX "codex_mastery_summary_equipment_score_rank_idx" ON "codex_mastery_summary" USING btree ("equipment_score_milli" DESC NULLS LAST,"gold_count" DESC NULLS LAST,"seal_count" DESC NULLS LAST,"scored_category_count" DESC NULLS LAST,"equipment_score_reached_at","user_id");--> statement-breakpoint
CREATE INDEX "codex_mastery_summary_fish_score_rank_idx" ON "codex_mastery_summary" USING btree ("fish_score_milli" DESC NULLS LAST,"gold_count" DESC NULLS LAST,"seal_count" DESC NULLS LAST,"scored_category_count" DESC NULLS LAST,"fish_score_reached_at","user_id");--> statement-breakpoint
CREATE INDEX "codex_mastery_summary_monster_score_rank_idx" ON "codex_mastery_summary" USING btree ("monster_score_milli" DESC NULLS LAST,"gold_count" DESC NULLS LAST,"seal_count" DESC NULLS LAST,"scored_category_count" DESC NULLS LAST,"monster_score_reached_at","user_id");--> statement-breakpoint
CREATE INDEX "codex_mastery_summary_cooking_score_rank_idx" ON "codex_mastery_summary" USING btree ("cooking_score_milli" DESC NULLS LAST,"gold_count" DESC NULLS LAST,"seal_count" DESC NULLS LAST,"scored_category_count" DESC NULLS LAST,"cooking_score_reached_at","user_id");--> statement-breakpoint
CREATE INDEX "codex_mastery_summary_life_score_rank_idx" ON "codex_mastery_summary" USING btree ("life_score_milli" DESC NULLS LAST,"gold_count" DESC NULLS LAST,"seal_count" DESC NULLS LAST,"scored_category_count" DESC NULLS LAST,"life_score_reached_at","user_id");--> statement-breakpoint
CREATE INDEX "codex_mastery_summary_job_score_rank_idx" ON "codex_mastery_summary" USING btree ("job_score_milli" DESC NULLS LAST,"gold_count" DESC NULLS LAST,"seal_count" DESC NULLS LAST,"scored_category_count" DESC NULLS LAST,"job_score_reached_at","user_id");