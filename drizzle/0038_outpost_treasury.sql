CREATE TABLE "outpost_treasury" (
	"outpost_id" text PRIMARY KEY NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
