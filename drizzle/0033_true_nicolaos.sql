CREATE TABLE "v2_guild_lineups" (
	"guild_id" integer PRIMARY KEY NOT NULL,
	"member_user_ids" text[] NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "v2_guild_lineups" ADD CONSTRAINT "v2_guild_lineups_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;