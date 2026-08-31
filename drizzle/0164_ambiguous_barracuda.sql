ALTER TABLE "referral_conversions" ADD COLUMN "completed_tutorial_task_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
UPDATE "referral_conversions"
SET "completed_tutorial_task_ids" = CASE "rewarded_stamina_depth"
	WHEN 6 THEN ARRAY['hunt_depth_24']::text[]
	WHEN 12 THEN ARRAY['hunt_depth_24', 'join_guild']::text[]
	WHEN 18 THEN ARRAY['hunt_depth_24', 'join_guild', 'life_level_5']::text[]
	WHEN 24 THEN ARRAY['hunt_depth_24', 'join_guild', 'life_level_5', 'hunt_depth_36']::text[]
	WHEN 36 THEN ARRAY['hunt_depth_24', 'join_guild', 'life_level_5', 'hunt_depth_36', 'life_level_10']::text[]
	ELSE ARRAY[]::text[]
END;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_tutorial_tasks_check" CHECK ("referral_conversions"."completed_tutorial_task_ids" <@ ARRAY['hunt_depth_24', 'join_guild', 'life_level_5', 'hunt_depth_36', 'life_level_10']::text[] AND cardinality("referral_conversions"."completed_tutorial_task_ids") <= 5);
