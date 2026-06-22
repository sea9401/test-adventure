CREATE TABLE "tile_settlements" (
	"col" integer NOT NULL,
	"row" integer NOT NULL,
	"user_id" text NOT NULL,
	"tier" text DEFAULT 'frontier' NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tile_settlements_col_row_pk" PRIMARY KEY("col","row")
);
--> statement-breakpoint
ALTER TABLE "tile_settlements" ADD CONSTRAINT "tile_settlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;