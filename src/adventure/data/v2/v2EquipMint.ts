// 새 장비 개체(instance) 발급의 단일 지점 — 그동안 12개 라우트가
// `{ iid: genEquipIid(), id, roll: rollItemStats(...) }` 리터럴을 각자 복붙했다(2026-07 통합).
// iid 는 항상 새로 발급(재사용 금지 규약 — v2Equipment.ts V2EquipInstance 참조).
import {
  genEquipIid,
  parseCraftedBy,
  parseEquipRoll,
  parseInstanceCraftQuality,
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipmentId,
  type V2EquipRoll,
} from "./v2Equipment";
import { parseEnhance } from "./v2Enhance";
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

/**
 * 거래소 매물 payload(굴림+강화+제작품질+제작자) → 새 iid 개체 복원 — buy/cancel/expire 공용.
 * 옛 행은 raw roll 만 저장돼 있어 방어 파스로 양형을 흡수한다.
 * craftQuality 가 있으면 enhance 는 무시(양쪽 동시 부착 금지 규약 — buy/cancel 기존 로직).
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
      })
    | null
    | undefined;
  const roll = parseEquipRoll(payloadRaw ?? undefined);
  const craftedBy = parseCraftedBy(payloadRaw?.craftedBy);
  const craftQuality = parseInstanceCraftQuality(
    payloadRaw?.craftQuality,
    payloadRaw?.enhance,
    craftedBy,
  );
  const enhance = craftQuality ? undefined : parseEnhance(payloadRaw?.enhance);
  return {
    ...mintEquipInstance(id, roll),
    ...(enhance ? { enhance } : {}),
    ...(craftQuality ? { craftQuality } : {}),
    ...(craftedBy ? { craftedBy } : {}),
  };
}
