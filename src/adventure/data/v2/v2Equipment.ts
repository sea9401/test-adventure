// v2 placeholder 장비.
//
// "갈아엎을수도있으니까" — 라이브 ITEMS catalog 와 분리해 v2_ 접두어로 자체 풀.
// 효과(스탯 보너스) wiring 은 보류 — 이 PR 은 장착 UI 검증 수준.
// 저장 위치: 별 save key `equipment.v2` (character.v2.equipped 와 충돌 X).

export type V2EquipSlot = "weapon" | "armor" | "accessory";

export type V2EquipmentId =
  // 무기
  | "v2_iron_sword"
  | "v2_wooden_bow"
  | "v2_oak_staff"
  // 방어구
  | "v2_leather_armor"
  | "v2_chain_mail"
  // 장신구
  | "v2_silver_ring"
  | "v2_jade_amulet";

export type V2Equipment = {
  id: V2EquipmentId;
  slot: V2EquipSlot;
  name: string;
  description: string;
};

export const V2_EQUIPMENT: Record<V2EquipmentId, V2Equipment> = {
  v2_iron_sword: {
    id: "v2_iron_sword",
    slot: "weapon",
    name: "철검",
    description: "흔한 한손검. 무난한 무게와 균형.",
  },
  v2_wooden_bow: {
    id: "v2_wooden_bow",
    slot: "weapon",
    name: "목궁",
    description: "참나무로 깎은 활. 가볍지만 사정거리 짧다.",
  },
  v2_oak_staff: {
    id: "v2_oak_staff",
    slot: "weapon",
    name: "참나무 지팡이",
    description: "옹이가 굵은 지팡이. 무게가 손에 익는다.",
  },
  v2_leather_armor: {
    id: "v2_leather_armor",
    slot: "armor",
    name: "가죽 갑옷",
    description: "들개 가죽을 손질해 만든 가벼운 갑옷.",
  },
  v2_chain_mail: {
    id: "v2_chain_mail",
    slot: "armor",
    name: "쇠사슬 갑옷",
    description: "고리를 엮은 갑옷. 무겁지만 든든하다.",
  },
  v2_silver_ring: {
    id: "v2_silver_ring",
    slot: "accessory",
    name: "은가락지",
    description: "흠집 없는 은반지. 광택이 곱다.",
  },
  v2_jade_amulet: {
    id: "v2_jade_amulet",
    slot: "accessory",
    name: "옥 부적",
    description: "옥 조각에 끈을 꿴 부적. 묘하게 안심된다.",
  },
};

// 슬롯별 catalog id 모음 — UI 가 슬롯 탭 표시할 때 사용.
export function v2EquipmentBySlot(slot: V2EquipSlot): V2Equipment[] {
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[])
    .map((id) => V2_EQUIPMENT[id])
    .filter((e) => e.slot === slot);
}
