DROP INDEX "coop_boss_active_region_idx";--> statement-breakpoint
ALTER TABLE "coop_boss_sessions" ADD COLUMN "summoned_by_name" text;--> statement-breakpoint
CREATE INDEX "coop_boss_active_region_lookup_idx" ON "coop_boss_sessions" USING btree ("region_id") WHERE "coop_boss_sessions"."defeated_at" IS NULL;