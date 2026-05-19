CREATE TABLE "guild_lodge_donations" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_lodge_donations_kind_valid" CHECK ("guild_lodge_donations"."kind" IN ('stardust','gold')),
	CONSTRAINT "guild_lodge_donations_amount_positive" CHECK ("guild_lodge_donations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "guild_lodge_state" (
	"guild_id" integer PRIMARY KEY NOT NULL,
	"stardust_total" integer DEFAULT 0 NOT NULL,
	"gold_total" integer DEFAULT 0 NOT NULL,
	"last_donation_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "lodge_rank" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "lodge_slogan" text;--> statement-breakpoint
ALTER TABLE "guild_lodge_donations" ADD CONSTRAINT "guild_lodge_donations_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_lodge_donations" ADD CONSTRAINT "guild_lodge_donations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_lodge_state" ADD CONSTRAINT "guild_lodge_state_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guild_lodge_donations_guild_created_idx" ON "guild_lodge_donations" USING btree ("guild_id","created_at");