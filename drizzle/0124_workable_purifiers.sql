CREATE TABLE "account_link_intents" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_link_intents_provider_check" CHECK ("account_link_intents"."provider" in ('google', 'kakao'))
);
--> statement-breakpoint
ALTER TABLE "account_link_intents" ADD CONSTRAINT "account_link_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_link_intents_expires_idx" ON "account_link_intents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "account_link_intents_user_provider_idx" ON "account_link_intents" USING btree ("user_id","provider");