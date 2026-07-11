ALTER TABLE "guild_exploration_weekly"
  ADD COLUMN IF NOT EXISTS "woodcutting_success_progress" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "farm_harvest_progress" integer DEFAULT 0 NOT NULL;
