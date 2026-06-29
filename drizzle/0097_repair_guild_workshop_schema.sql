-- Idempotent production repair for guild workshop rollout.
-- Safe on already-migrated databases; restores columns/tables if a previous deploy recorded
-- migration progress before the full schema was present.
ALTER TABLE "outpost_villages"
  ADD COLUMN IF NOT EXISTS "buildings" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS "guild_workshop_weekly" (
  "guild_id" integer PRIMARY KEY NOT NULL REFERENCES "guilds"("id") ON DELETE cascade,
  "week_key" text NOT NULL,
  "craft_count" integer DEFAULT 0 NOT NULL,
  "quality_count" integer DEFAULT 0 NOT NULL,
  "claimed" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "artisan_leaderboard_snapshots" (
  "week_key" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "rank" integer NOT NULL,
  "total_crafts" integer DEFAULT 0 NOT NULL,
  "quality_crafts" integer DEFAULT 0 NOT NULL,
  "weekly_xp" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "reward_claimed_at" timestamp,
  PRIMARY KEY ("week_key", "user_id")
);

CREATE INDEX IF NOT EXISTS "artisan_leaderboard_snapshots_week_rank_idx"
  ON "artisan_leaderboard_snapshots" ("week_key", "rank");
