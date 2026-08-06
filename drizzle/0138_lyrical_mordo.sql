ALTER TABLE "guild_trade_weekly" ADD COLUMN "tokens" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- 기존 개인 교역 토큰을 같은 길드의 공동 잔고로 합친다. 아직 교역소 상태 행이
-- 없는 길드는 애플리케이션의 lazy migration 이 각 길드원 첫 방문 때 안전하게 이관한다.
WITH "personal_tokens" AS (
	SELECT
		("value" ->> 'guildId')::integer AS "guild_id",
		SUM(
			CASE
				WHEN ("value" ->> 'tokens') ~ '^[0-9]+$'
					THEN ("value" ->> 'tokens')::bigint
				ELSE 0
			END
		) AS "tokens"
	FROM "saves_kv"
	WHERE "key" = 'guild-trade-user.v1'
		AND ("value" ->> 'guildId') ~ '^[1-9][0-9]*$'
	GROUP BY ("value" ->> 'guildId')::integer
),
"transferred" AS (
	UPDATE "guild_trade_weekly" AS "weekly"
	SET
		"tokens" = LEAST(2147483647, "weekly"."tokens"::bigint + "personal_tokens"."tokens")::integer,
		"updated_at" = now()
	FROM "personal_tokens"
	WHERE "weekly"."guild_id" = "personal_tokens"."guild_id"
	RETURNING "weekly"."guild_id"
)
UPDATE "saves_kv" AS "save"
SET
	"value" = jsonb_set("save"."value", '{tokens}', '0'::jsonb, true),
	"version" = "save"."version" + 1,
	"updated_at" = now()
WHERE "save"."key" = 'guild-trade-user.v1'
	AND ("save"."value" ->> 'guildId') ~ '^[1-9][0-9]*$'
	AND ("save"."value" ->> 'guildId')::integer IN (
		SELECT "guild_id" FROM "transferred"
	);
