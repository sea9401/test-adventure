CREATE TABLE "v2_guild_resources" (
	"guild_id" integer PRIMARY KEY NOT NULL,
	"stone" integer DEFAULT 0 NOT NULL,
	"soldiers" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "v2_guild_resources" ADD CONSTRAINT "v2_guild_resources_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 백필 — 각 길드의 자원은 마스터의 saves_kv 의 v2-resources 에서 가져옴.
-- 1인 길드 가정에서 마스터 = 그 user 의 자원이 곧 길드 자원.
-- v2-resources JSON 의 stone/soldiers 만 추출, 결손 시 0. soldiers 는 cap clamp.
-- SOLDIER_MAX_TOTAL=200 (data/v2/soldiers.ts) — 코드와 동기화 필요 시 마이그레이션 수정.
INSERT INTO "v2_guild_resources" ("guild_id", "stone", "soldiers", "updated_at")
SELECT
  g.id,
  GREATEST(0, COALESCE((s.value->>'stone')::integer, 0)),
  LEAST(200, GREATEST(0, COALESCE((s.value->>'soldiers')::integer, 0))),
  now()
FROM "guilds" g
LEFT JOIN "saves_kv" s ON s.user_id = g.master_id AND s.key = 'v2-resources'
ON CONFLICT ("guild_id") DO NOTHING;