CREATE TABLE "outpost_defenders" (
	"outpost_id" text NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" integer NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outpost_defenders_outpost_id_user_id_pk" PRIMARY KEY("outpost_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "outpost_defenders" ADD CONSTRAINT "outpost_defenders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outpost_defenders" ADD CONSTRAINT "outpost_defenders_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;