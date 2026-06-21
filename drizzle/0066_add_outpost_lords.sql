CREATE TABLE "outpost_lords" (
	"outpost_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" integer NOT NULL,
	"last_harvest_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "outpost_lords" ADD CONSTRAINT "outpost_lords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outpost_lords" ADD CONSTRAINT "outpost_lords_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;