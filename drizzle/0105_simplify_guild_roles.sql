WITH ranked_admins AS (
  SELECT
    "guild_id",
    "user_id",
    row_number() OVER (
      PARTITION BY "guild_id"
      ORDER BY
        CASE WHEN "role" = 'manager' THEN 0 ELSE 1 END,
        "joined_at" ASC,
        "user_id" ASC
    ) AS "rn"
  FROM "guild_members"
  WHERE "role" IN ('manager', 'vice_master')
)
UPDATE "guild_members" AS "gm"
SET "role" = CASE WHEN "ra"."rn" <= 2 THEN 'manager' ELSE 'member' END
FROM "ranked_admins" AS "ra"
WHERE "gm"."guild_id" = "ra"."guild_id"
  AND "gm"."user_id" = "ra"."user_id";
--> statement-breakpoint
UPDATE "guild_activity_log"
SET "meta" = jsonb_set("meta", '{role}', '"manager"'::jsonb, false)
WHERE "type" = 'role_change'
  AND "meta" IS NOT NULL
  AND "meta"->>'role' = 'vice_master';
