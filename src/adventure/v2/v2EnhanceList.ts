import {
  V2_EQUIPMENT,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";

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
