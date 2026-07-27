CREATE TABLE "coupon_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"reward" jsonb NOT NULL,
	"message" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_campaigns_period_check" CHECK ("coupon_campaigns"."ends_at" > "coupon_campaigns"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "coupon_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"code_suffix" text NOT NULL,
	"issued_for_user_id" text,
	"restricted_user_id" text,
	"redeemed_by_user_id" text,
	"redeemed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_codes_redeemed_pair_check" CHECK (("coupon_codes"."redeemed_at" IS NULL AND "coupon_codes"."redeemed_by_user_id" IS NULL) OR ("coupon_codes"."redeemed_at" IS NOT NULL AND "coupon_codes"."redeemed_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "coupon_codes" ADD CONSTRAINT "coupon_codes_campaign_id_coupon_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."coupon_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_campaigns_slug_idx" ON "coupon_campaigns" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_codes_hash_idx" ON "coupon_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_codes_campaign_issued_user_idx" ON "coupon_codes" USING btree ("campaign_id","issued_for_user_id") WHERE "coupon_codes"."issued_for_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "coupon_codes_campaign_redeemed_idx" ON "coupon_codes" USING btree ("campaign_id","redeemed_at");