CREATE TABLE "referral_reward_identities" (
	"identity_hash" text PRIMARY KEY NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "referral_conversions" DROP CONSTRAINT "referral_conversions_referred_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "referral_conversions" DROP CONSTRAINT "referral_conversions_pkey";--> statement-breakpoint
ALTER TABLE "referral_conversions" ALTER COLUMN "referred_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD COLUMN "id" serial PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD COLUMN "referred_name" text;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD COLUMN "referred_deleted_at" timestamp;--> statement-breakpoint
UPDATE "referral_conversions" AS "conversion"
SET "referred_name" = COALESCE(
	(SELECT "game_name" FROM "users" WHERE "users"."id" = "conversion"."referred_user_id"),
	'새 모험가'
);--> statement-breakpoint
ALTER TABLE "referral_conversions" ALTER COLUMN "referred_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_referred_user_id_unique" UNIQUE("referred_user_id");
