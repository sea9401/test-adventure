CREATE TABLE "ugc_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_user_id" text,
	"reporter_name" text NOT NULL,
	"subject_type" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"target_user_id" text,
	"target_name" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"content_snapshot" text NOT NULL,
	"context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_note" text,
	"resolved_by_user_id" text,
	"reviewed_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ugc_reports_subject_type_check" CHECK ("ugc_reports"."subject_type" IN ('content', 'user')),
	CONSTRAINT "ugc_reports_source_type_check" CHECK ("ugc_reports"."source_type" IN ('bulletin_post', 'bulletin_comment', 'chat_message')),
	CONSTRAINT "ugc_reports_reason_check" CHECK ("ugc_reports"."reason" IN ('harassment', 'hate', 'sexual', 'violence', 'spam', 'fraud', 'personal_info', 'other')),
	CONSTRAINT "ugc_reports_status_check" CHECK ("ugc_reports"."status" IN ('open', 'reviewing', 'resolved', 'dismissed')),
	CONSTRAINT "ugc_reports_details_length_check" CHECK ("ugc_reports"."details" IS NULL OR char_length("ugc_reports"."details") <= 500)
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"blocked_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_user_id_blocked_user_id_pk" PRIMARY KEY("blocker_user_id","blocked_user_id"),
	CONSTRAINT "user_blocks_not_self_check" CHECK ("user_blocks"."blocker_user_id" <> "user_blocks"."blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE "ugc_reports" ADD CONSTRAINT "ugc_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_reports" ADD CONSTRAINT "ugc_reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_reports" ADD CONSTRAINT "ugc_reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ugc_reports_status_created_idx" ON "ugc_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ugc_reports_target_user_created_idx" ON "ugc_reports" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "ugc_reports_reporter_created_idx" ON "ugc_reports" USING btree ("reporter_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_reports_active_duplicate_idx" ON "ugc_reports" USING btree ("reporter_user_id","subject_type","source_type","source_id") WHERE "ugc_reports"."status" IN ('open', 'reviewing');--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_user_idx" ON "user_blocks" USING btree ("blocked_user_id","created_at");