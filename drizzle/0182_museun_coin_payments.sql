CREATE TABLE "museun_coin_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"customer_key" text NOT NULL,
	"free_balance" integer DEFAULT 0 NOT NULL,
	"paid_balance" integer DEFAULT 0 NOT NULL,
	"review_required_at" timestamp,
	"review_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "museun_coin_accounts_balances_nonnegative" CHECK ("museun_coin_accounts"."free_balance" >= 0 AND "museun_coin_accounts"."paid_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "museun_coin_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"source_id" text,
	"free_delta" integer DEFAULT 0 NOT NULL,
	"paid_delta" integer DEFAULT 0 NOT NULL,
	"free_balance_after" integer NOT NULL,
	"paid_balance_after" integer NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "museun_coin_ledger_balances_nonnegative" CHECK ("museun_coin_ledger"."free_balance_after" >= 0 AND "museun_coin_ledger"."paid_balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "museun_coin_paid_lots" (
	"order_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"granted_coins" integer NOT NULL,
	"available_coins" integer NOT NULL,
	"held_coins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "museun_coin_paid_lots_values_nonnegative" CHECK ("museun_coin_paid_lots"."granted_coins" > 0 AND "museun_coin_paid_lots"."available_coins" >= 0 AND "museun_coin_paid_lots"."held_coins" >= 0),
	CONSTRAINT "museun_coin_paid_lots_balance_valid" CHECK ("museun_coin_paid_lots"."available_coins" + "museun_coin_paid_lots"."held_coins" <= "museun_coin_paid_lots"."granted_coins")
);
--> statement-breakpoint
CREATE TABLE "museun_coin_payment_orders" (
	"order_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"package_id" text NOT NULL,
	"coin_amount" integer NOT NULL,
	"amount_krw" integer NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"payment_key" text,
	"method" text,
	"failure_code" text,
	"failure_message" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"canceled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "museun_coin_payment_orders_amounts_positive" CHECK ("museun_coin_payment_orders"."coin_amount" > 0 AND "museun_coin_payment_orders"."amount_krw" > 0),
	CONSTRAINT "museun_coin_payment_orders_status_valid" CHECK ("museun_coin_payment_orders"."status" IN ('ready', 'confirming', 'paid', 'cancel_pending', 'partially_canceled', 'canceled', 'failed', 'review_required'))
);
--> statement-breakpoint
CREATE TABLE "museun_coin_refund_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"user_id" text,
	"requested_coins" integer NOT NULL,
	"amount_krw" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_by_email" text,
	"toss_transaction_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	CONSTRAINT "museun_coin_refund_requests_amounts_positive" CHECK ("museun_coin_refund_requests"."requested_coins" > 0 AND "museun_coin_refund_requests"."amount_krw" > 0),
	CONSTRAINT "museun_coin_refund_requests_status_valid" CHECK ("museun_coin_refund_requests"."status" IN ('pending', 'cancel_pending', 'completed', 'rejected', 'review_required', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "museun_coin_spend_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"ledger_id" integer NOT NULL,
	"lot_order_id" text NOT NULL,
	"coins" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "museun_coin_spend_allocations_coins_positive" CHECK ("museun_coin_spend_allocations"."coins" > 0)
);
--> statement-breakpoint
ALTER TABLE "museun_coin_accounts" ADD CONSTRAINT "museun_coin_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museun_coin_ledger" ADD CONSTRAINT "museun_coin_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museun_coin_paid_lots" ADD CONSTRAINT "museun_coin_paid_lots_order_id_museun_coin_payment_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."museun_coin_payment_orders"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museun_coin_paid_lots" ADD CONSTRAINT "museun_coin_paid_lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museun_coin_payment_orders" ADD CONSTRAINT "museun_coin_payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museun_coin_refund_requests" ADD CONSTRAINT "museun_coin_refund_requests_order_id_museun_coin_payment_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."museun_coin_payment_orders"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museun_coin_refund_requests" ADD CONSTRAINT "museun_coin_refund_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museun_coin_spend_allocations" ADD CONSTRAINT "museun_coin_spend_allocations_ledger_id_museun_coin_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."museun_coin_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museun_coin_spend_allocations" ADD CONSTRAINT "museun_coin_spend_allocations_lot_order_id_museun_coin_paid_lots_order_id_fk" FOREIGN KEY ("lot_order_id") REFERENCES "public"."museun_coin_paid_lots"("order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "museun_coin_accounts_customer_key_unique" ON "museun_coin_accounts" USING btree ("customer_key");--> statement-breakpoint
CREATE UNIQUE INDEX "museun_coin_ledger_event_key_unique" ON "museun_coin_ledger" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "museun_coin_ledger_user_created_idx" ON "museun_coin_ledger" USING btree ("user_id","id" DESC);--> statement-breakpoint
CREATE INDEX "museun_coin_ledger_source_idx" ON "museun_coin_ledger" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "museun_coin_paid_lots_user_fifo_idx" ON "museun_coin_paid_lots" USING btree ("user_id","created_at","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "museun_coin_payment_orders_payment_key_unique" ON "museun_coin_payment_orders" USING btree ("payment_key");--> statement-breakpoint
CREATE INDEX "museun_coin_payment_orders_user_requested_idx" ON "museun_coin_payment_orders" USING btree ("user_id","requested_at" DESC);--> statement-breakpoint
CREATE INDEX "museun_coin_payment_orders_status_updated_idx" ON "museun_coin_payment_orders" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "museun_coin_refund_requests_order_idx" ON "museun_coin_refund_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "museun_coin_refund_requests_user_created_idx" ON "museun_coin_refund_requests" USING btree ("user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "museun_coin_refund_requests_status_created_idx" ON "museun_coin_refund_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "museun_coin_spend_allocations_ledger_idx" ON "museun_coin_spend_allocations" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "museun_coin_spend_allocations_lot_idx" ON "museun_coin_spend_allocations" USING btree ("lot_order_id");