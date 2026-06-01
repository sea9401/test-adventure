CREATE TABLE "fishing_seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"rewards_granted_at" timestamp,
	"winners" integer DEFAULT 0 NOT NULL,
	"total_coins" integer DEFAULT 0 NOT NULL
);
