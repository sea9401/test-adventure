ALTER TABLE "outpost_occupations" ADD COLUMN "fort_hp" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "outpost_occupations" ADD COLUMN "fort_max_hp" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "outpost_occupations" ADD COLUMN "fort_updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "outpost_occupations" ADD COLUMN "protected_until" timestamp DEFAULT now() NOT NULL;