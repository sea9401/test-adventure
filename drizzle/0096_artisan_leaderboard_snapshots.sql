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
