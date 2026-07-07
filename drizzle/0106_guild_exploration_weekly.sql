CREATE TABLE IF NOT EXISTS "guild_exploration_weekly" (
  "guild_id" integer PRIMARY KEY NOT NULL REFERENCES "guilds"("id") ON DELETE cascade,
  "week_key" text NOT NULL,
  "coop_epic_progress" integer DEFAULT 0 NOT NULL,
  "hunt_win_progress" integer DEFAULT 0 NOT NULL,
  "fishing_catch_progress" integer DEFAULT 0 NOT NULL,
  "claimed" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
