// 발굴한 골동품 보관함 — 인스턴스 풀. 거래소(PR-5)·분해(PR-6)의 원천.
//
// 설계: docs/treasure-hunt-plan.md §3
// 저장 키 treasure-collection.v1 (savesKv). 발굴 성공(PR-3 dig) 시 인스턴스 1점 추가.
// normalize 위조 가드는 antiqueInstances 가 담당.

import {
  normalizeAntiqueInstances,
  type AntiqueInstance,
} from "./antiqueInstances";
import {
  ANTIQUES,
  ANTIQUE_TIER_ORDER,
  sellGoldValue,
  type AntiqueTier,
} from "@/adventure/data/v2/antique";

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

// instanceId 로 한 점 제거(순수). 분해(PR-6)에서 사용. 없으면 null(차감 대상 부재).
export function removeInstanceById(
  c: TreasureCollection,
  instanceId: string,
): { collection: TreasureCollection; removed: AntiqueInstance } | null {
  const removed = c.instances.find((i) => i.instanceId === instanceId);
  if (!removed) return null;
  return {
    collection: { instances: c.instances.filter((i) => i.instanceId !== instanceId) },
    removed,
  };
}

// ── 등급 기준 일괄 판매 ── 고가품 실수 판매 방지: 흔함·보통까지만 일괄 대상(희귀↑ 제외).
//   클라 미리보기·서버 정산이 같은 순수 함수를 쓰고, 등급 캡은 데이터(여기)+라우트가 함께 강제.
export const BULK_SELL_MAX_TIER: AntiqueTier = "uncommon";

// 일괄 판매 허용 등급인가 — maxTier 가 캡(흔함·보통) 이하인지. 서버가 희귀↑ 요청을 거부할 때 사용.
//   알 수 없는/위조 문자열은 indexOf=-1 이므로 명시적으로 거부(-1 <= 1 = true 오판 방지).
export function isBulkSellableTier(maxTier: AntiqueTier): boolean {
  const idx = ANTIQUE_TIER_ORDER.indexOf(maxTier);
  return idx >= 0 && idx <= ANTIQUE_TIER_ORDER.indexOf(BULK_SELL_MAX_TIER);
}

// maxTier 이하 등급 인스턴스만 선택(순수). 알 수 없는 antiqueId(정규화 누락분)는 제외(안전).
export function selectInstancesUpToTier(
  instances: AntiqueInstance[],
  maxTier: AntiqueTier,
): AntiqueInstance[] {
  const cap = ANTIQUE_TIER_ORDER.indexOf(maxTier);
  return instances.filter((i) => {
    const a = ANTIQUES[i.antiqueId];
    return a != null && ANTIQUE_TIER_ORDER.indexOf(a.tier) <= cap;
  });
}

// 인스턴스 묶음의 총 감정사 판매가(순수, 골드). 클라 미리보기·서버 정산 공용.
export function bulkSellGold(instances: AntiqueInstance[]): number {
  return instances.reduce(
    (sum, i) => sum + sellGoldValue(i.antiqueId, i.condition),
    0,
  );
}
