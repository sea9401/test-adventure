CREATE TABLE "outpost_villages" (
	"outpost_id" text PRIMARY KEY NOT NULL,
	"guild_id" integer NOT NULL,
	"tier" text DEFAULT 'village' NOT NULL,
	"name" text,
	"jobs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "v2_guild_resources" ADD COLUMN "settlement" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "outpost_villages" ADD CONSTRAINT "outpost_villages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;