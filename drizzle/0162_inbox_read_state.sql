ALTER TABLE "marketplace_inbox" ADD COLUMN "read_at" timestamp;--> statement-breakpoint
UPDATE "marketplace_inbox"
SET "read_at" = "claimed_at"
WHERE "claimed_at" IS NOT NULL AND "read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "inbox_unread_idx" ON "marketplace_inbox" USING btree ("user_id","created_at") WHERE "marketplace_inbox"."read_at" IS NULL;
