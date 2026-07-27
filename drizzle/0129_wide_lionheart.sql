CREATE TABLE "storage_deletion_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "storage_deletion_queue_kind_check" CHECK ("storage_deletion_queue"."kind" in ('profile_user', 'feedback_image', 'guild'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "storage_deletion_queue_kind_target_idx" ON "storage_deletion_queue" USING btree ("kind","target");--> statement-breakpoint
CREATE INDEX "storage_deletion_queue_next_attempt_idx" ON "storage_deletion_queue" USING btree ("next_attempt_at");