ALTER TABLE "cooking_first_discoveries" DROP CONSTRAINT "cooking_first_discoveries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "cooking_first_discoveries" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cooking_first_discoveries" ADD CONSTRAINT "cooking_first_discoveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Restore first discoveries lost when the discoverer's account was deleted.
-- A research success writes the save and this row in one transaction, so a
-- non-basic recipe held in a save without a row can only come from that cascade.
-- The original time is gone; the earliest save update among holders stands in.
INSERT INTO "cooking_first_discoveries" ("recipe_id", "user_id", "actor_name", "discovered_at")
SELECT held.recipe_id, NULL, '탈퇴한 사용자', MIN(s.updated_at)
FROM saves_kv s
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(s.value->'discoveredRecipeIds') = 'array'
    THEN s.value->'discoveredRecipeIds'
    ELSE '[]'::jsonb
  END
) AS held(recipe_id)
WHERE s.key = 'cooking.v2'
  AND held.recipe_id NOT IN ('rustic_bread', 'herb_tea', 'grilled_corn', 'fish_skewer', 'herb_flatbread', 'country_egg_bread')
GROUP BY held.recipe_id
ON CONFLICT ("recipe_id") DO NOTHING;
