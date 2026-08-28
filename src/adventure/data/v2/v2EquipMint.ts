// 새 장비 개체(instance) 발급의 단일 지점 — 그동안 12개 라우트가
// `{ iid: genEquipIid(), id, roll: rollItemStats(...) }` 리터럴을 각자 복붙했다(2026-07 통합).
// iid 는 항상 새로 발급(재사용 금지 규약 — v2Equipment.ts V2EquipInstance 참조).
import {
  genEquipIid,
  parseCraftedBy,
  parseEquipRollForItem,
  parseInstanceCraftQuality,
  parseInstanceEnhance,
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipmentId,
  type V2EquipRoll,
} from "./v2Equipment";
import { rollItemStats } from "./v2EquipVariance";

/** 무굴림 개체 — 상점 정가·퀘스트 보상·스타터처럼 "카탈로그값 그대로"가 의도인 발급. */
export function mintEquipInstance(
  id: V2EquipmentId,
  roll?: V2EquipRoll,
): V2EquipInstance {
  return { iid: genEquipIid(), id, ...(roll ? { roll } : {}) };
}

/** 새 굴림(±편차) 개체 — 드랍·우편·제작·운영 지급 계열. */
export function mintRolledEquipInstance(
  id: V2EquipmentId,
  rng: () => number = Math.random,
): V2EquipInstance {
  return mintEquipInstance(id, rollItemStats(V2_EQUIPMENT[id], rng));
}

/** 거래소의 옛 매물 payload 에 실제 강화 상태가 있는지 판정한다. */
export function listedEquipEnhance(payload: unknown) {
  const payloadRaw = payload as
    | (Record<string, unknown> & {
        craftedBy?: unknown;
        craftQuality?: unknown;
        enhance?: unknown;
        stormRefined?: unknown;
      })
    | null
    | undefined;
  const craftedBy = parseCraftedBy(payloadRaw?.craftedBy);
  return parseInstanceEnhance(
    payloadRaw?.enhance,
    payloadRaw?.craftQuality,
    craftedBy,
  );
}

/** 거래 payload에 명시적으로 저장된 계정 귀속 여부. */
export function listedEquipBound(payload: unknown): boolean {
  return (payload as { bound?: unknown } | null | undefined)?.bound === true;
}

/**
 * 거래소 매물 payload(굴림+강화+제작품질+제작자) → 새 iid 개체 복원 — buy/cancel/expire 공용.
 * 옛 행은 raw roll 만 저장돼 있어 방어 파스로 양형을 흡수한다.
 * 명시적 craftQuality와 실제 enhance는 별도 축으로 함께 복원한다. 구형 제작품이 enhance에
 * 저장한 품질만 parseInstanceEnhance에서 강화로 취급하지 않는다.
 */
export function mintListedEquipInstance(
  id: V2EquipmentId,
  payload: unknown,
): V2EquipInstance {
  const payloadRaw = payload as
    | (Record<string, unknown> & {
        craftedBy?: unknown;
        craftQuality?: unknown;
        enhance?: unknown;
        bound?: unknown;
        stormRefined?: unknown;
      })
    | null
    | undefined;
  const roll = parseEquipRollForItem(V2_EQUIPMENT[id], payloadRaw ?? undefined);
  const craftedBy = parseCraftedBy(payloadRaw?.craftedBy);
  const craftQuality = parseInstanceCraftQuality(
    payloadRaw?.craftQuality,
    payloadRaw?.enhance,
    craftedBy,
  );
  const enhance = listedEquipEnhance(payloadRaw);
  const bound = listedEquipBound(payloadRaw);
  return {
    ...mintEquipInstance(id, roll),
    ...(enhance ? { enhance } : {}),
    ...(bound ? { bound: true as const } : {}),
    ...(craftQuality ? { craftQuality } : {}),
    ...(craftedBy ? { craftedBy } : {}),
    ...(payloadRaw?.stormRefined === true ? { stormRefined: true } : {}),
  };
}
