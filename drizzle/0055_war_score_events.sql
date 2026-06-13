CREATE TABLE "war_score_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"outpost_id" text NOT NULL,
	"guild_id" integer,
	"user_id" text,
	"event_type" text NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "war_score_events" ADD CONSTRAINT "war_score_events_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "war_score_events" ADD CONSTRAINT "war_score_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "war_score_events_season_guild_idx" ON "war_score_events" USING btree ("season_id","guild_id");--> statement-breakpoint
CREATE INDEX "war_score_events_season_outpost_idx" ON "war_score_events" USING btree ("season_id","outpost_id");--> statement-breakpoint
CREATE INDEX "war_score_events_season_user_idx" ON "war_score_events" USING btree ("season_id","user_id");