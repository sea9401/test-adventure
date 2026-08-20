ALTER TABLE "codex_research_seasons" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
CREATE TABLE "codex_research_publications" (
	"season_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "codex_research_publications_season_id_user_id_channel_pk" PRIMARY KEY("season_id","user_id","channel"),
	CONSTRAINT "codex_research_publications_channel_valid" CHECK ("codex_research_publications"."channel" IN ('notification', 'feed'))
);--> statement-breakpoint
ALTER TABLE "codex_research_publications" ADD CONSTRAINT "codex_research_publications_season_id_codex_research_seasons_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."codex_research_seasons"("season_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_research_publications" ADD CONSTRAINT "codex_research_publications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codex_research_publications_user_published_idx" ON "codex_research_publications" USING btree ("user_id","published_at");
