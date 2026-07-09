ALTER TABLE "guild_exploration_weekly"
  ADD COLUMN IF NOT EXISTS "content" jsonb DEFAULT '{}'::jsonb NOT NULL;
