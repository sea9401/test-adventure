CREATE TABLE "codex_trophy_history" (
	"user_id" text NOT NULL,
	"trophy_id" text NOT NULL,
	"trophy_kind" text NOT NULL,
	"current_tier" text NOT NULL,
	"tier_achieved_at" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"catalog_version" integer DEFAULT 1 NOT NULL,
	"season_metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "codex_trophy_history_user_id_trophy_id_pk" PRIMARY KEY("user_id","trophy_id"),
	CONSTRAINT "codex_trophy_history_kind_valid" CHECK ("codex_trophy_history"."trophy_kind" IN ('mastery_category', 'mastery_overall')),
	CONSTRAINT "codex_trophy_history_tier_valid" CHECK ("codex_trophy_history"."current_tier" IN ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary')),
	CONSTRAINT "codex_trophy_history_catalog_version_positive" CHECK ("codex_trophy_history"."catalog_version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "codex_trophy_history" ADD CONSTRAINT "codex_trophy_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codex_trophy_history_user_kind_tier_idx" ON "codex_trophy_history" USING btree ("user_id","trophy_kind","current_tier");