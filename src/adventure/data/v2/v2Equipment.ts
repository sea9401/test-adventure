// v2 placeholder 장비.
//
// "갈아엎을수도있으니까" — 라이브 ITEMS catalog 와 분리해 v2_ 접두어로 자체 풀.
// 저장 위치: 별 save key `equipment.v2` (character.v2.equipped 와 충돌 X).
//
// PR-1 코어: stats 필드를 더해 derivePlayerCombatV2 가 합산할 수 있게 만든다.
// 7종은 임시 T1~T2 위치의 수치 — PR-2 에서 부위×컨셉×티어 그리드로 확장하면서 정식 정렬.
// crit/mp/eva 같은 추가 파생은 PR-2 에서 — PR-1 stats 는 라이브 EquipBonus 와 같은 모양
// (6스탯 + atk/def) 으로 좁혀 derive 의 기존 합산 경로를 그대로 탄다.

import type { EquipBonus } from "@/adventure/data/items/types";
import type { StatKey } from "@/adventure/data/stats";

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

// V2_EQUIPMENT.stats — 라이브 EquipBonus 와 같은 모양(6스탯 + atk/def).
// derivePlayerCombatV2 가 가짜 minimal EquippedItemForDerive 의 bonus 필드로 흘려서
// derive 의 기존 합산 경로를 그대로 탄다.
export type V2EquipStats = EquipBonus;

export type V2Equipment = {
  id: V2EquipmentId;
  slot: V2EquipSlot;
  name: string;
  description: string;
  stats: V2EquipStats;
};

// 임시 T1~T2 위치 — PR-2 에서 부위×컨셉×티어 그리드로 확장하면서 재배치.
export const V2_EQUIPMENT: Record<V2EquipmentId, V2Equipment> = {
  v2_iron_sword: {
    id: "v2_iron_sword",
    slot: "weapon",
    name: "철검",
    description: "흔한 한손검. 무난한 무게와 균형.",
    stats: { str: 5, atk: 3 },
  },
  v2_wooden_bow: {
    id: "v2_wooden_bow",
    slot: "weapon",
    name: "목궁",
    description: "참나무로 깎은 활. 가볍지만 사정거리 짧다.",
    stats: { dex: 4, atk: 2 },
  },
  v2_oak_staff: {
    id: "v2_oak_staff",
    slot: "weapon",
    name: "참나무 지팡이",
    description: "옹이가 굵은 지팡이. 무게가 손에 익는다.",
    stats: { int: 5, atk: 1 },
  },
  v2_leather_armor: {
    id: "v2_leather_armor",
    slot: "armor",
    name: "가죽 갑옷",
    description: "들개 가죽을 손질해 만든 가벼운 갑옷.",
    stats: { vit: 2, def: 3 },
  },
  v2_chain_mail: {
    id: "v2_chain_mail",
    slot: "armor",
    name: "쇠사슬 갑옷",
    description: "고리를 엮은 갑옷. 무겁지만 든든하다.",
    stats: { vit: 5, def: 6 },
  },
  v2_silver_ring: {
    id: "v2_silver_ring",
    slot: "accessory",
    name: "은가락지",
    description: "흠집 없는 은반지. 광택이 곱다.",
    stats: { luk: 3, dex: 1 },
  },
  v2_jade_amulet: {
    id: "v2_jade_amulet",
    slot: "accessory",
    name: "옥 부적",
    description: "옥 조각에 끈을 꿴 부적. 묘하게 안심된다.",
    stats: { int: 3, vit: 1 },
  },
};

// 슬롯별 catalog id 모음 — UI 가 슬롯 탭 표시할 때 사용.
export function v2EquipmentBySlot(slot: V2EquipSlot): V2Equipment[] {
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[])
    .map((id) => V2_EQUIPMENT[id])
    .filter((e) => e.slot === slot);
}

// stats 표시 공용 — atk/def 와 6스탯을 동일 자리에서 처리.
export type V2EquipBonusKey = keyof V2EquipStats;

export const V2_EQUIP_BONUS_KEYS: readonly V2EquipBonusKey[] = [
  "atk",
  "def",
  "str",
  "dex",
  "vit",
  "spd",
  "luk",
  "int",
];

export const V2_EQUIP_BONUS_LABELS: Record<V2EquipBonusKey, string> = {
  atk: "공격력",
  def: "방어력",
  str: "힘",
  dex: "민첩",
  vit: "활력",
  spd: "속도",
  luk: "행운",
  int: "지능",
};

// 6스탯만 추리는 키셋 — derive 에서 atk/def 와 분리해야 할 때 사용.
export const V2_EQUIP_STAT_KEYS: readonly StatKey[] = [
  "str",
  "dex",
  "vit",
  "spd",
  "luk",
  "int",
];

// ─────────────────────────────────────────────────────────────────────
// equipment.v2 save 파싱 — owned/equipped 정합 보정.
//
// 라우트(GET·equip·grant) 와 derivePlayerCombatV2 가 공유한다. v2Equipment.ts 가
// catalog 의 단일 source 이므로 파싱도 여기에 두는 게 자연스럽다.

export type EquipmentSave = {
  owned?: unknown;
  equipped?: unknown;
};

const VALID_IDS: ReadonlySet<string> = new Set(Object.keys(V2_EQUIPMENT));
const VALID_SLOTS_SET: ReadonlySet<V2EquipSlot> = new Set([
  "weapon",
  "armor",
  "accessory",
]);

export function parseEquipmentSave(raw: unknown): {
  owned: V2EquipmentId[];
  equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>;
} {
  const v = (raw ?? {}) as EquipmentSave;
  const ownedRaw = Array.isArray(v.owned) ? v.owned : [];
  const owned: V2EquipmentId[] = [];
  const seen = new Set<string>();
  for (const id of ownedRaw) {
    if (typeof id !== "string" || !VALID_IDS.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    owned.push(id as V2EquipmentId);
  }
  const equippedRaw =
    v.equipped && typeof v.equipped === "object" ? v.equipped : {};
  const equipped: Partial<Record<V2EquipSlot, V2EquipmentId>> = {};
  for (const slot of VALID_SLOTS_SET) {
    const id = (equippedRaw as Record<string, unknown>)[slot];
    if (typeof id !== "string" || !VALID_IDS.has(id)) continue;
    const item = V2_EQUIPMENT[id as V2EquipmentId];
    if (item.slot !== slot) continue;
    // 장착하려면 보유해야 함 (race 보정).
    if (!seen.has(id)) continue;
    equipped[slot] = id as V2EquipmentId;
  }
  return { owned, equipped };
}
