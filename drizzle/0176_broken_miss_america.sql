CREATE TABLE "cooking_failed_combinations" (
	"user_id" text NOT NULL,
	"combo_hash" text NOT NULL,
	"method" text NOT NULL,
	"ingredient_ids" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cooking_failed_combinations_user_id_combo_hash_pk" PRIMARY KEY("user_id","combo_hash"),
	CONSTRAINT "cooking_failed_combinations_hash_length" CHECK (length("cooking_failed_combinations"."combo_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "cooking_first_discoveries" (
	"recipe_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"discovered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cooking_failed_combinations" ADD CONSTRAINT "cooking_failed_combinations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_first_discoveries" ADD CONSTRAINT "cooking_first_discoveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cooking_failed_combinations_created_idx" ON "cooking_failed_combinations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "cooking_first_discoveries_user_idx" ON "cooking_first_discoveries" USING btree ("user_id","discovered_at");
