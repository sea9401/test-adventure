import {
  v2EquipCatalogTierToDisplayTier,
  V2_EQUIPMENT,
  type V2EquipDisplayTier,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import type { EquipmentLockFilter } from "./inventory/EquipmentTab";
import { matchesEquipmentSearch } from "./itemSearch";

// 강화 후보는 현재 착용 장비를 먼저 보여주고, 나머지는 기존 기준인
// 강화 단계 → 위력 순으로 정렬한다. 페이지네이션 전에 적용해야 착용 장비가
// 보유 수량과 관계없이 항상 첫 페이지 최상단에 남는다.
export function sortEnhanceCandidates(
  instances: V2EquipInstance[],
  equippedIid: string | null,
): V2EquipInstance[] {
  return [...instances].sort(
    (a, b) =>
      Number(b.iid === equippedIid) - Number(a.iid === equippedIid) ||
      (b.enhance?.level ?? 0) - (a.enhance?.level ?? 0) ||
      (b.roll?.power ?? V2_EQUIPMENT[b.id]?.power ?? 0) -
        (a.roll?.power ?? V2_EQUIPMENT[a.id]?.power ?? 0),
  );
}

export type EnhanceCandidateFilter = {
  search: string;
  lock: EquipmentLockFilter;
  tier: V2EquipDisplayTier | "all";
};

function displayTierOf(instance: V2EquipInstance): V2EquipDisplayTier | null {
  const item = V2_EQUIPMENT[instance.id];
  return item ? v2EquipCatalogTierToDisplayTier(item.tier) : null;
}

// 강화 후보 검색·잠금·티어 필터. 정렬된 목록을 받아 순서를 그대로 둔다.
export function filterEnhanceCandidates(
  instances: V2EquipInstance[],
  { search, lock, tier }: EnhanceCandidateFilter,
): V2EquipInstance[] {
  return instances.filter(
    (instance) =>
      (lock === "all" || (instance.locked === true) === (lock === "locked")) &&
      (tier === "all" || displayTierOf(instance) === tier) &&
      matchesEquipmentSearch(instance.id, search),
  );
}

// 티어 선택 상자에 보여 줄 표시 티어 — 보유한 티어만, 높은 티어부터.
export function enhanceTierOptions(
  instances: V2EquipInstance[],
): Array<{ tier: V2EquipDisplayTier; count: number }> {
  const counts = new Map<V2EquipDisplayTier, number>();
  for (const instance of instances) {
    const tier = displayTierOf(instance);
    if (tier !== null) counts.set(tier, (counts.get(tier) ?? 0) + 1);
  }
  return [...counts]
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.tier - a.tier);
}
