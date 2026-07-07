ALTER TABLE "guild_exploration_weekly"
  ADD COLUMN IF NOT EXISTS "deep_hunt_win_progress" integer DEFAULT 0 NOT NULL;
