CREATE TABLE "chat_room_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "chat_room_invites_status_check" CHECK ("chat_room_invites"."status" in ('pending', 'accepted', 'declined', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "chat_room_members" (
	"room_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_room_members_room_id_user_id_pk" PRIMARY KEY("room_id","user_id"),
	CONSTRAINT "chat_room_members_role_check" CHECK ("chat_room_members"."role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_rooms_visibility_check" CHECK ("chat_rooms"."visibility" in ('public', 'private')),
	CONSTRAINT "chat_rooms_name_length_check" CHECK (char_length("chat_rooms"."name") between 2 and 24)
);
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_channel_scope_check";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "room_id" integer;--> statement-breakpoint
ALTER TABLE "chat_room_invites" ADD CONSTRAINT "chat_room_invites_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_invites" ADD CONSTRAINT "chat_room_invites_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_invites" ADD CONSTRAINT "chat_room_invites_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_room_invites_pending_unique_idx" ON "chat_room_invites" USING btree ("room_id","to_user_id") WHERE "chat_room_invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "chat_room_invites_recipient_idx" ON "chat_room_invites" USING btree ("to_user_id","created_at") WHERE "chat_room_invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "chat_room_members_user_joined_idx" ON "chat_room_members" USING btree ("user_id","joined_at");--> statement-breakpoint
CREATE INDEX "chat_rooms_visibility_created_idx" ON "chat_rooms" USING btree ("visibility","created_at");--> statement-breakpoint
CREATE INDEX "chat_rooms_owner_idx" ON "chat_rooms" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_room_created_at_idx" ON "messages" USING btree ("room_id","created_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_scope_check" CHECK (("messages"."channel" = 'global' AND "messages"."guild_id" IS NULL AND "messages"."room_id" IS NULL) OR ("messages"."channel" = 'guild' AND "messages"."guild_id" IS NOT NULL AND "messages"."room_id" IS NULL) OR ("messages"."channel" = 'room' AND "messages"."guild_id" IS NULL AND "messages"."room_id" IS NOT NULL));