-- Custom SQL migration file, put your code below! --

-- 옛 outpost 기반 정착지/점령 데이터 전량 삭제 (자유 타일 지도로 전환).
--   길드 거점 관리에 표기되던 옛 마을·점령 상태를 제거한다.
--   새 자유 타일 정착지(tile_settlements) 는 FK 무관계 — 무접촉.
--   집계 로그 outpost_claim_attempts(전투 기록) 는 append-only 감사용이라 보존(고아 안전).
--
-- 골드 손실 0:
--   점령 길드가 있는 거점 금고(outpost_treasury)의 미수확 골드를 삭제 전에
--   해당 길드 공용 골드 풀(v2_guild_resources.gold)로 정산한다(없으면 행 생성).
--   미점령(NPC) 거점 금고는 플레이어 가치가 아니므로 폐기.

-- 1) 거점 금고 정산 — 점령 길드별 미수확 골드 합산 → 길드 공용 풀 가산.
INSERT INTO "v2_guild_resources" ("guild_id", "gold", "settlement", "updated_at")
SELECT o."occupied_by_guild_id" AS guild_id,
       SUM(t."gold") AS gold,
       '{}'::jsonb AS settlement,
       now() AS updated_at
FROM "outpost_treasury" t
JOIN "outpost_occupations" o ON o."outpost_id" = t."outpost_id"
WHERE o."occupied_by_guild_id" IS NOT NULL
  AND t."gold" > 0
GROUP BY o."occupied_by_guild_id"
ON CONFLICT ("guild_id") DO UPDATE
  SET "gold" = "v2_guild_resources"."gold" + EXCLUDED."gold",
      "updated_at" = now();
--> statement-breakpoint

-- 2) 옛 outpost 시스템 데이터 삭제 (이 테이블들 사이엔 FK 없음 — 삭제 순서 무관).
DELETE FROM "outpost_treasury";
--> statement-breakpoint
DELETE FROM "outpost_villages";
--> statement-breakpoint
DELETE FROM "outpost_occupations";
--> statement-breakpoint
DELETE FROM "outpost_defenders";
--> statement-breakpoint
DELETE FROM "outpost_lords";
