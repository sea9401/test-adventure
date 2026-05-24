CREATE TABLE "fiefdom_raids" (
	"id" serial PRIMARY KEY NOT NULL,
	"attacker_guild_id" integer NOT NULL,
	"defender_guild_id" integer NOT NULL,
	"initiator_user_id" text NOT NULL,
	"won" boolean NOT NULL,
	"loot_gold" integer DEFAULT 0 NOT NULL,
	"loot_wood" integer DEFAULT 0 NOT NULL,
	"loot_food" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiefdoms" (
	"guild_id" integer PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"shield_until" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiefdom_raids" ADD CONSTRAINT "fiefdom_raids_attacker_guild_id_guilds_id_fk" FOREIGN KEY ("attacker_guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiefdom_raids" ADD CONSTRAINT "fiefdom_raids_defender_guild_id_guilds_id_fk" FOREIGN KEY ("defender_guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiefdom_raids" ADD CONSTRAINT "fiefdom_raids_initiator_user_id_users_id_fk" FOREIGN KEY ("initiator_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiefdoms" ADD CONSTRAINT "fiefdoms_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fiefdom_raids_defender_idx" ON "fiefdom_raids" USING btree ("defender_guild_id","created_at");--> statement-breakpoint
CREATE INDEX "fiefdom_raids_attacker_idx" ON "fiefdom_raids" USING btree ("attacker_guild_id","created_at");