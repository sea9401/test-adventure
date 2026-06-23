ALTER TABLE "outpost_villages" ALTER COLUMN "guild_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outpost_villages" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "outpost_villages" ADD CONSTRAINT "outpost_villages_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;