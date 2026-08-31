CREATE TABLE "battle_replays" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battle_replays" ADD CONSTRAINT "battle_replays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_replays_user_created_idx" ON "battle_replays" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "battle_replays_expires_idx" ON "battle_replays" USING btree ("expires_at");