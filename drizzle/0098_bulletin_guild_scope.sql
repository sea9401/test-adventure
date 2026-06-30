ALTER TABLE "bulletin_posts"
  ADD COLUMN IF NOT EXISTS "guild_id" integer REFERENCES "guilds"("id") ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "bulletin_posts_guild_created_at_idx"
  ON "bulletin_posts" ("guild_id", "created_at");
