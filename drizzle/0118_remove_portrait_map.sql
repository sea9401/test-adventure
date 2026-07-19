-- 삭제된 「화공 공방 입장권」(portrait_map)을 기존 캐릭터 저장 데이터에서도 제거한다.
-- rareMaps가 정상 배열인 행만 대상으로 하고, 실제 보유분이 있는 행만 version을 올린다.
UPDATE "saves_kv" AS "save"
SET
  "value" = jsonb_set(
    "save"."value",
    '{rareMaps}',
    COALESCE(
      (
        SELECT jsonb_agg("entry")
        FROM jsonb_array_elements("save"."value"->'rareMaps') AS "entry"
        WHERE "entry"->>'kind' IS DISTINCT FROM 'portrait_map'
      ),
      '[]'::jsonb
    ),
    true
  ),
  "version" = "save"."version" + 1,
  "updated_at" = now()
WHERE "save"."key" = 'character.v2'
  AND jsonb_typeof("save"."value"->'rareMaps') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("save"."value"->'rareMaps') AS "entry"
    WHERE "entry"->>'kind' = 'portrait_map'
  );
--> statement-breakpoint
-- 거래소에 에스크로된 활성 매물은 반환하지 않고 삭제 아이템으로 종료한다.
-- 판매 완료·취소 이력은 감사 기록이므로 보존한다.
UPDATE "marketplace_listings_v2"
SET "status" = 'expired', "closed_at" = COALESCE("closed_at", now())
WHERE "kind" = 'consumable'
  AND "item_id" = 'portrait_map'
  AND "status" = 'active';
