// 발굴한 골동품 보관함 — 인스턴스 풀. 거래소(PR-5)·분해(PR-6)의 원천.
//
// 설계: docs/treasure-hunt-plan.md §3
// 저장 키 treasure-collection.v1 (savesKv). 발굴 성공(PR-3 dig) 시 인스턴스 1점 추가.
// normalize 위조 가드는 antiqueInstances 가 담당.

import {
  normalizeAntiqueInstances,
  type AntiqueInstance,
} from "./antiqueInstances";

export const TREASURE_COLLECTION_KEY = "treasure-collection.v1";

export type TreasureCollection = { instances: AntiqueInstance[] };

export const emptyTreasureCollection = (): TreasureCollection => ({
  instances: [],
});

export function parseTreasureCollection(raw: unknown): TreasureCollection {
  if (!raw || typeof raw !== "object") return emptyTreasureCollection();
  const r = raw as Record<string, unknown>;
  // { instances: [...] } 또는 배열 그 자체도 수용.
  const src = Array.isArray(r.instances) ? r.instances : raw;
  return { instances: normalizeAntiqueInstances(src) };
}

// 인스턴스 추가(순수). instanceId 중복은 무시(같은 자루 두 번 박힘 방지).
export function addInstance(
  c: TreasureCollection,
  inst: AntiqueInstance,
): TreasureCollection {
  if (c.instances.some((i) => i.instanceId === inst.instanceId)) return c;
  return { instances: [...c.instances, inst] };
}
