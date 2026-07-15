CREATE TABLE "guild_facility_upgrade_donations" (
	"guild_id" integer NOT NULL,
	"building_id" text NOT NULL,
	"target_level" integer NOT NULL,
	"materials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_facility_upgrade_donations_guild_id_building_id_pk" PRIMARY KEY("guild_id","building_id")
);
--> statement-breakpoint
ALTER TABLE "guild_facility_upgrade_donations" ADD CONSTRAINT "guild_facility_upgrade_donations_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
