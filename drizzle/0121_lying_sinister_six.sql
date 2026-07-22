CREATE TABLE "lottery_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"ticket_count" integer NOT NULL,
	"first_ticket_number" integer NOT NULL,
	"amount_paid" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_purchases_ticket_count_check" CHECK ("lottery_purchases"."ticket_count" BETWEEN 1 AND 10),
	CONSTRAINT "lottery_purchases_first_ticket_check" CHECK ("lottery_purchases"."first_ticket_number" > 0),
	CONSTRAINT "lottery_purchases_amount_check" CHECK ("lottery_purchases"."amount_paid" > 0)
);
--> statement-breakpoint
CREATE TABLE "lottery_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"ticket_price" integer NOT NULL,
	"total_tickets" integer DEFAULT 0 NOT NULL,
	"gross_pool" bigint DEFAULT 0 NOT NULL,
	"fee_amount" bigint DEFAULT 0 NOT NULL,
	"prize_pool" bigint DEFAULT 0 NOT NULL,
	"commit_hash" text NOT NULL,
	"draw_secret" text NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_rounds_status_check" CHECK ("lottery_rounds"."status" IN ('open','settled','refunded')),
	CONSTRAINT "lottery_rounds_ticket_price_check" CHECK ("lottery_rounds"."ticket_price" > 0),
	CONSTRAINT "lottery_rounds_total_tickets_check" CHECK ("lottery_rounds"."total_tickets" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lottery_winners" (
	"round_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"purchase_id" integer,
	"user_id" text,
	"actor_name" text NOT NULL,
	"ticket_number" integer NOT NULL,
	"prize_amount" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_winners_round_id_rank_pk" PRIMARY KEY("round_id","rank"),
	CONSTRAINT "lottery_winners_rank_check" CHECK ("lottery_winners"."rank" BETWEEN 1 AND 3),
	CONSTRAINT "lottery_winners_ticket_check" CHECK ("lottery_winners"."ticket_number" > 0),
	CONSTRAINT "lottery_winners_prize_check" CHECK ("lottery_winners"."prize_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lottery_purchases" ADD CONSTRAINT "lottery_purchases_round_id_lottery_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."lottery_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_purchases" ADD CONSTRAINT "lottery_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_winners" ADD CONSTRAINT "lottery_winners_round_id_lottery_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."lottery_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_winners" ADD CONSTRAINT "lottery_winners_purchase_id_lottery_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."lottery_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_winners" ADD CONSTRAINT "lottery_winners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_purchases_user_request_unique_idx" ON "lottery_purchases" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "lottery_purchases_round_created_idx" ON "lottery_purchases" USING btree ("round_id","created_at");--> statement-breakpoint
CREATE INDEX "lottery_purchases_round_user_idx" ON "lottery_purchases" USING btree ("round_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_rounds_starts_at_unique_idx" ON "lottery_rounds" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "lottery_rounds_status_ends_at_idx" ON "lottery_rounds" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "lottery_winners_user_created_idx" ON "lottery_winners" USING btree ("user_id","created_at");