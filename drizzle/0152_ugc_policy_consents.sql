CREATE TABLE "ugc_policy_consents" (
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ugc_policy_consents_user_id_version_pk" PRIMARY KEY("user_id","version")
);
--> statement-breakpoint
ALTER TABLE "ugc_policy_consents" ADD CONSTRAINT "ugc_policy_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;