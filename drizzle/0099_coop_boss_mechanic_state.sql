ALTER TABLE "coop_boss_sessions"
  ADD COLUMN IF NOT EXISTS "mechanic_state" jsonb DEFAULT '{}'::jsonb NOT NULL;
