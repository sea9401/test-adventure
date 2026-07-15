ALTER TABLE "user_sanctions" ADD COLUMN "acknowledged_at" timestamp;
--> statement-breakpoint
UPDATE "user_sanctions"
SET "acknowledged_at" = "created_at"
WHERE "type" = 'warn';
