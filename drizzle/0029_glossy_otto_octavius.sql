CREATE TABLE "outpost_claim_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"outpost_id" text NOT NULL,
	"attacker_user_id" text NOT NULL,
	"attacker_guild_id" integer,
	"defender_name" text NOT NULL,
	"defender_user_id" text,
	"won" boolean NOT NULL,
	"turns" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outpost_occupations" (
	"outpost_id" text PRIMARY KEY NOT NULL,
	"occupied_by_user_id" text,
	"occupied_by_guild_id" integer,
	"occupied_at" timestamp DEFAULT now() NOT NULL,
	"policy" text DEFAULT 'open' NOT NULL,
	"tax_rate" numeric(4, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outpost_claim_attempts" ADD CONSTRAINT "outpost_claim_attempts_attacker_user_id_users_id_fk" FOREIGN KEY ("attacker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outpost_claim_attempts" ADD CONSTRAINT "outpost_claim_attempts_attacker_guild_id_guilds_id_fk" FOREIGN KEY ("attacker_guild_id") REFERENCES "public"."guilds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outpost_claim_attempts" ADD CONSTRAINT "outpost_claim_attempts_defender_user_id_users_id_fk" FOREIGN KEY ("defender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outpost_occupations" ADD CONSTRAINT "outpost_occupations_occupied_by_user_id_users_id_fk" FOREIGN KEY ("occupied_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outpost_occupations" ADD CONSTRAINT "outpost_occupations_occupied_by_guild_id_guilds_id_fk" FOREIGN KEY ("occupied_by_guild_id") REFERENCES "public"."guilds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outpost_claim_attempts_outpost_idx" ON "outpost_claim_attempts" USING btree ("outpost_id","created_at");--> statement-breakpoint
CREATE INDEX "outpost_claim_attempts_attacker_idx" ON "outpost_claim_attempts" USING btree ("attacker_user_id","created_at");