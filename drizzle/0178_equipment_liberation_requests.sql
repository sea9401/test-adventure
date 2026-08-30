CREATE TABLE "equipment_liberation_requests" (
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"iid" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_liberation_requests_user_id_request_id_pk" PRIMARY KEY("user_id","request_id"),
	CONSTRAINT "equipment_liberation_requests_revision_nonnegative" CHECK ("equipment_liberation_requests"."expected_revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "equipment_liberation_requests" ADD CONSTRAINT "equipment_liberation_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_liberation_requests_created_idx" ON "equipment_liberation_requests" USING btree ("created_at");