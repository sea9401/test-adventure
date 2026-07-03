CREATE TABLE "ops_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_email" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
