CREATE TABLE IF NOT EXISTS "guild_workshop_weekly" (
  "guild_id" integer PRIMARY KEY NOT NULL REFERENCES "guilds"("id") ON DELETE cascade,
  "week_key" text NOT NULL,
  "craft_count" integer DEFAULT 0 NOT NULL,
  "quality_count" integer DEFAULT 0 NOT NULL,
  "claimed" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
