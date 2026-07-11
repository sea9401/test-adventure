ALTER TABLE "feedback_reports"
  ADD COLUMN "admin_reply" text,
  ADD COLUMN "reviewed_at" timestamp,
  ADD COLUMN "replied_at" timestamp;
