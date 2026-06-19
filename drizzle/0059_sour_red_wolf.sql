CREATE TABLE "guild_activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" integer NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text,
	"target_user_id" text,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_activity_log" ADD CONSTRAINT "guild_activity_log_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guild_activity_log_guild_created_idx" ON "guild_activity_log" USING btree ("guild_id","created_at");