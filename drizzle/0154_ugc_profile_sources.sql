ALTER TABLE "ugc_reports" DROP CONSTRAINT "ugc_reports_source_type_check";--> statement-breakpoint
ALTER TABLE "ugc_reports" ALTER COLUMN "source_id" SET DATA TYPE text USING "source_id"::text;--> statement-breakpoint
ALTER TABLE "ugc_reports" ADD CONSTRAINT "ugc_reports_source_type_check" CHECK ("ugc_reports"."source_type" IN ('bulletin_post', 'bulletin_comment', 'chat_message', 'inbox_message', 'profile', 'guild_profile', 'chat_room'));
