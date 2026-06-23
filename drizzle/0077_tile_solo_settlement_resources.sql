CREATE TABLE "user_settlement_resources" (
	"user_id" text PRIMARY KEY NOT NULL,
	"settlement" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settlement_resources" ADD CONSTRAINT "user_settlement_resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;