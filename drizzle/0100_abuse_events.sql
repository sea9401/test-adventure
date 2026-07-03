CREATE TABLE IF NOT EXISTS "abuse_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text,
  "ip" text,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "detail" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "abuse_events" ADD CONSTRAINT "abuse_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "abuse_events_created_idx" ON "abuse_events" ("id" DESC);
CREATE INDEX IF NOT EXISTS "abuse_events_user_created_idx" ON "abuse_events" ("user_id","id" DESC);
CREATE INDEX IF NOT EXISTS "abuse_events_ip_created_idx" ON "abuse_events" ("ip","id" DESC);
CREATE INDEX IF NOT EXISTS "abuse_events_action_created_idx" ON "abuse_events" ("action","id" DESC);
