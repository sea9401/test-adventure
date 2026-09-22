CREATE TABLE "chuseok_attacks" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chuseok_attacks_event_id_user_id_request_id_pk" PRIMARY KEY("event_id","user_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "chuseok_events" (
	"id" text PRIMARY KEY NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"stage" integer DEFAULT 1 NOT NULL,
	"hp" bigint DEFAULT 100000000 NOT NULL,
	"max_hp" bigint DEFAULT 100000000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chuseok_participants" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"attendance_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"damage" bigint DEFAULT 0 NOT NULL,
	"attack_count" integer DEFAULT 0 NOT NULL,
	"day_key" text DEFAULT '' NOT NULL,
	"daily_attack_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chuseok_participants_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "chuseok_attacks" ADD CONSTRAINT "chuseok_attacks_event_id_chuseok_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."chuseok_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chuseok_attacks" ADD CONSTRAINT "chuseok_attacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chuseok_participants" ADD CONSTRAINT "chuseok_participants_event_id_chuseok_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."chuseok_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chuseok_participants" ADD CONSTRAINT "chuseok_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;