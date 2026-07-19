ALTER TABLE "guilds" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "guilds"
SET "level" = CASE
  WHEN "fame_total" >= 30000 THEN 5
  WHEN "fame_total" >= 16000 THEN 4
  WHEN "fame_total" >= 8000 THEN 3
  WHEN "fame_total" >= 3000 THEN 2
  ELSE 1
END;--> statement-breakpoint
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_level_check" CHECK ("guilds"."level" between 1 and 5);
