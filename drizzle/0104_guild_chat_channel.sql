ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "channel" text DEFAULT 'global' NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "guild_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_guild_id_guilds_id_fk'
  ) THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_guild_id_guilds_id_fk"
      FOREIGN KEY ("guild_id") REFERENCES "guilds"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_channel_created_at_idx"
  ON "messages" USING btree ("channel", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_guild_created_at_idx"
  ON "messages" USING btree ("guild_id", "created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_channel_scope_check'
  ) THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_channel_scope_check"
      CHECK (
        ("channel" = 'global' AND "guild_id" IS NULL)
        OR ("channel" = 'guild' AND "guild_id" IS NOT NULL)
      );
  END IF;
END $$;
