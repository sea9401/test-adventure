// 인벤토리 / 거래소 판매 등 "내 아이템 목록" 공용 — 슬롯 탭·정렬 단일 소스.
//   두 화면이 같은 탭 구성·정렬 규칙을 쓰도록(중복·divergence 방지).

import {
  V2_EQUIPMENT,
  effectiveStats,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";

// 슬롯 6종 + 재료 + 소모품(레어맵 등). 인벤토리·거래소 판매 탭 공용.
export type V2ItemTabKey = V2EquipSlot | "material" | "consumable";

export const V2_ITEM_TABS: ReadonlyArray<{ key: V2ItemTabKey; label: string }> =
  [
    { key: "weapon", label: "무기" },
    { key: "armor", label: "갑옷" },
    { key: "gloves", label: "장갑" },
    { key: "boots", label: "신발" },
    { key: "ring", label: "반지" },
    { key: "necklace", label: "목걸이" },
    { key: "material", label: "재료" },
    { key: "consumable", label: "소모품" },
  ];

export type SortMode = "default" | "roll" | "power";

// 정렬 순환 — 단일 버튼이 누를 때마다 다음으로(기본 → 품질순 → 위력순 → 기본).
export const SORT_CYCLE: ReadonlyArray<{ key: SortMode; label: string }> = [
  { key: "default", label: "기본" },
  { key: "roll", label: "품질순" },
  { key: "power", label: "위력순" },
];

export function nextSortMode(mode: SortMode): SortMode {
  const idx = SORT_CYCLE.findIndex((s) => s.key === mode);
  return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length].key;
}

export function sortModeLabel(mode: SortMode): string {
  return SORT_CYCLE.find((s) => s.key === mode)?.label ?? "기본";
}

// 장비 개체 목록 정렬(비파괴) —
//   default: 티어 → 컨셉 → 이름(ko) → iid (안정).
//   roll:    굴림 품질 높은 순(굴림 없는 상점템은 뒤로).
//   power:   굴림 반영 실효 위력 높은 순.
export function sortEquipInstances(
  list: V2EquipInstance[],
  mode: SortMode,
): V2EquipInstance[] {
  const sorted = [...list];
  if (mode === "roll") {
    sorted.sort((a, b) => {
      const ia = V2_EQUIPMENT[a.id];
      const ib = V2_EQUIPMENT[b.id];
      const qa = ia ? rollQualityPct(ia, a.roll) : null;
      const qb = ib ? rollQualityPct(ib, b.roll) : null;
      if (qa == null && qb == null) return 0;
      if (qa == null) return 1;
      if (qb == null) return -1;
      return qb - qa;
    });
  } else if (mode === "power") {
    sorted.sort((a, b) => {
      const ia = V2_EQUIPMENT[a.id];
      const ib = V2_EQUIPMENT[b.id];
      const pa = ia ? effectiveStats(ia, a.roll).power : 0;
      const pb = ib ? effectiveStats(ib, b.roll).power : 0;
      return pb - pa;
    });
  } else {
    sorted.sort((a, b) => {
      const ia = V2_EQUIPMENT[a.id];
      const ib = V2_EQUIPMENT[b.id];
      if (!ia || !ib) return 0;
      return (
        ia.tier - ib.tier ||
        ia.concept.localeCompare(ib.concept) ||
        ia.name.localeCompare(ib.name, "ko") ||
        a.iid.localeCompare(b.iid)
      );
    });
  }
  return sorted;
}
