CREATE TABLE "guild_raid_attack_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" integer NOT NULL,
	"request_id" text NOT NULL,
	"name" text NOT NULL,
	"damage_dealt" bigint NOT NULL,
	"damage_taken" bigint NOT NULL,
	"died_early" boolean DEFAULT false NOT NULL,
	"stage_before" integer NOT NULL,
	"stage_after" integer NOT NULL,
	"hp_before" bigint NOT NULL,
	"hp_after" bigint NOT NULL,
	"replay" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_raid_attack_logs_damage_nonnegative" CHECK ("guild_raid_attack_logs"."damage_dealt" >= 0),
	CONSTRAINT "guild_raid_attack_logs_damage_taken_nonnegative" CHECK ("guild_raid_attack_logs"."damage_taken" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guild_raid_events" (
	"id" text PRIMARY KEY NOT NULL,
	"week_key" text NOT NULL,
	"boss_kind" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stage" integer DEFAULT 1 NOT NULL,
	"hp" bigint NOT NULL,
	"max_hp" bigint NOT NULL,
	"mechanic_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_raid_events_stage_positive" CHECK ("guild_raid_events"."stage" > 0),
	CONSTRAINT "guild_raid_events_hp_positive" CHECK ("guild_raid_events"."hp" > 0),
	CONSTRAINT "guild_raid_events_max_hp_positive" CHECK ("guild_raid_events"."max_hp" > 0),
	CONSTRAINT "guild_raid_events_status_valid" CHECK ("guild_raid_events"."status" IN ('active','settled'))
);
--> statement-breakpoint
CREATE TABLE "guild_raid_guild_scores" (
	"event_id" text NOT NULL,
	"guild_id" integer NOT NULL,
	"guild_name_snapshot" text NOT NULL,
	"guild_emblem_snapshot" text,
	"damage" bigint DEFAULT 0 NOT NULL,
	"final_rank" integer,
	"settled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_raid_guild_scores_event_id_guild_id_pk" PRIMARY KEY("event_id","guild_id"),
	CONSTRAINT "guild_raid_guild_scores_damage_nonnegative" CHECK ("guild_raid_guild_scores"."damage" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guild_raid_participants" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" integer NOT NULL,
	"name_snapshot" text NOT NULL,
	"damage" bigint DEFAULT 0 NOT NULL,
	"attack_count" integer DEFAULT 0 NOT NULL,
	"day_key" text NOT NULL,
	"daily_attack_count" integer DEFAULT 0 NOT NULL,
	"eligible_at_settlement" boolean,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_raid_participants_event_id_user_id_pk" PRIMARY KEY("event_id","user_id"),
	CONSTRAINT "guild_raid_participants_damage_nonnegative" CHECK ("guild_raid_participants"."damage" >= 0),
	CONSTRAINT "guild_raid_participants_attacks_nonnegative" CHECK ("guild_raid_participants"."attack_count" >= 0),
	CONSTRAINT "guild_raid_participants_daily_attacks_nonnegative" CHECK ("guild_raid_participants"."daily_attack_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "guild_raid_attack_logs" ADD CONSTRAINT "guild_raid_attack_logs_event_id_guild_raid_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."guild_raid_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_raid_attack_logs" ADD CONSTRAINT "guild_raid_attack_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_raid_guild_scores" ADD CONSTRAINT "guild_raid_guild_scores_event_id_guild_raid_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."guild_raid_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_raid_participants" ADD CONSTRAINT "guild_raid_participants_event_id_guild_raid_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."guild_raid_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_raid_participants" ADD CONSTRAINT "guild_raid_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guild_raid_attack_logs_request_unique_idx" ON "guild_raid_attack_logs" USING btree ("event_id","user_id","request_id");--> statement-breakpoint
CREATE INDEX "guild_raid_attack_logs_recent_idx" ON "guild_raid_attack_logs" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_raid_events_week_unique_idx" ON "guild_raid_events" USING btree ("week_key");--> statement-breakpoint
CREATE INDEX "guild_raid_events_status_end_idx" ON "guild_raid_events" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "guild_raid_guild_scores_rank_idx" ON "guild_raid_guild_scores" USING btree ("event_id","damage" DESC);--> statement-breakpoint
CREATE INDEX "guild_raid_participants_guild_damage_idx" ON "guild_raid_participants" USING btree ("event_id","guild_id","damage" DESC);
