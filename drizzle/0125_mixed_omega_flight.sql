CREATE TABLE "password_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"login_id" text NOT NULL,
	"normalized_login_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"disabled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_credentials_normalized_login_id_idx" ON "password_credentials" USING btree ("normalized_login_id");