CREATE TABLE IF NOT EXISTS "economy_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text,
  "counterparty_user_id" text,
  "event_type" text NOT NULL,
  "gold_delta" integer DEFAULT 0 NOT NULL,
  "item_kind" text,
  "item_id" text,
  "quantity" integer,
  "detail" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "economy_events"
    ADD CONSTRAINT "economy_events_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "economy_events"
    ADD CONSTRAINT "economy_events_counterparty_user_id_users_id_fk"
    FOREIGN KEY ("counterparty_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "abuse_events_created_at_idx" ON "abuse_events" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "abuse_events_reason_created_idx" ON "abuse_events" ("reason", "id" DESC);
CREATE INDEX IF NOT EXISTS "admin_audit_log_admin_created_idx" ON "admin_audit_log" ("admin_email", "id" DESC);
CREATE INDEX IF NOT EXISTS "admin_audit_log_action_created_idx" ON "admin_audit_log" ("action", "id" DESC);
CREATE INDEX IF NOT EXISTS "admin_audit_log_target_created_idx" ON "admin_audit_log" ("target_user_id", "id" DESC);
CREATE INDEX IF NOT EXISTS "economy_events_created_idx" ON "economy_events" ("id" DESC);
CREATE INDEX IF NOT EXISTS "economy_events_created_at_idx" ON "economy_events" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "economy_events_user_created_idx" ON "economy_events" ("user_id", "id" DESC);
CREATE INDEX IF NOT EXISTS "economy_events_type_created_idx" ON "economy_events" ("event_type", "id" DESC);
CREATE INDEX IF NOT EXISTS "economy_events_item_created_idx" ON "economy_events" ("item_kind", "item_id", "id" DESC);
