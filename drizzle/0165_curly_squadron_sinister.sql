CREATE TABLE "dangerous_fishing_boss_contributions" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"total_contribution" integer DEFAULT 0 NOT NULL,
	"successful_attempts" integer DEFAULT 0 NOT NULL,
	"first_contributed_at" timestamp NOT NULL,
	"last_contributed_at" timestamp NOT NULL,
	"reward_claimed_at" timestamp,
	CONSTRAINT "dangerous_fishing_boss_contributions_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "dangerous_fishing_boss_events" (
	"id" text PRIMARY KEY NOT NULL,
	"boss_id" text NOT NULL,
	"discoverer_id" text,
	"max_stamina" integer NOT NULL,
	"stamina" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"spawned_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"defeated_at" timestamp,
	"last_haul_user_id" text
);
--> statement-breakpoint
ALTER TABLE "dangerous_fishing_boss_contributions" ADD CONSTRAINT "dangerous_fishing_boss_contributions_event_id_dangerous_fishing_boss_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dangerous_fishing_boss_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dangerous_fishing_boss_contributions" ADD CONSTRAINT "dangerous_fishing_boss_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dangerous_fishing_boss_events" ADD CONSTRAINT "dangerous_fishing_boss_events_discoverer_id_users_id_fk" FOREIGN KEY ("discoverer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dangerous_fishing_boss_events" ADD CONSTRAINT "dangerous_fishing_boss_events_last_haul_user_id_users_id_fk" FOREIGN KEY ("last_haul_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dangerous_fishing_boss_contribution_user_idx" ON "dangerous_fishing_boss_contributions" USING btree ("user_id","last_contributed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dangerous_fishing_boss_one_active_idx" ON "dangerous_fishing_boss_events" USING btree ("status") WHERE "dangerous_fishing_boss_events"."status" = 'active';--> statement-breakpoint
CREATE INDEX "dangerous_fishing_boss_active_expiry_idx" ON "dangerous_fishing_boss_events" USING btree ("status","expires_at");