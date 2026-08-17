ALTER TABLE "ugc_reports" DROP CONSTRAINT "ugc_reports_source_type_check";--> statement-breakpoint
ALTER TABLE "ugc_reports" ADD CONSTRAINT "ugc_reports_source_type_check" CHECK ("ugc_reports"."source_type" IN ('bulletin_post', 'bulletin_comment', 'chat_message', 'inbox_message', 'profile', 'guild_profile', 'chat_room', 'marketplace_trade'));--> statement-breakpoint
ALTER TABLE "ugc_reports" DROP CONSTRAINT "ugc_reports_reason_check";--> statement-breakpoint
ALTER TABLE "ugc_reports" ADD CONSTRAINT "ugc_reports_reason_check" CHECK ("ugc_reports"."reason" IN ('harassment', 'hate', 'sexual', 'violence', 'spam', 'fraud', 'personal_info', 'abnormal_price', 'market_manipulation', 'real_money_trade', 'other'));
