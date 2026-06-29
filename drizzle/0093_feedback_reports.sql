CREATE TABLE "feedback_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "actor_name" text NOT NULL,
  "category" text DEFAULT 'suggestion' NOT NULL,
  "content" text NOT NULL,
  "path" text,
  "status" text DEFAULT 'open' NOT NULL,
  "admin_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "feedback_reports"
  ADD CONSTRAINT "feedback_reports_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "feedback_reports_user_created_idx"
  ON "feedback_reports" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "feedback_reports_status_created_idx"
  ON "feedback_reports" USING btree ("status","id" DESC);
