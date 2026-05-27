// v2 장비 카탈로그.
//
// "갈아엎을수도있으니까" — 라이브 ITEMS catalog 와 분리해 v2_ 접두어로 자체 풀.
// 저장 위치: 별 save key `equipment.v2` (character.v2.equipped 와 충돌 X).
//
// 설계 결정 (사용자 합의):
//   - 효과 결 = 혼합 (6스탯 + 소수 파생). PR-2 에서 crit/mp/eva 추가 파생 도입.
//   - 다양성 = 부위 특성 고정 + 티어 수직. PR-2 에서 7갈래 컨셉 × T1~T5 = 35종 그리드.
//   - 강화·affix·룬·set·랜덤옵션 = 일체 없음. 카탈로그 고정값.
//
// 컨셉 7갈래:
//   - 무기: str(힘) · dex(민) · int(지)
//   - 방어: heavy(중갑) · light(경갑)
//   - 장신: luck(운) · mana(마법)
//
// 티어 T1~T5 의 곡선은 컨셉별로 명시. PR-2 는 직관 튜닝 — PR-3 획득 wiring 후 sim
// 캘리브 (PR-4) 에서 정식 튜닝.

import type { EquipBonus } from "@/adventure/data/items/types";
import type { StatKey } from "@/adventure/data/stats";

export type V2EquipSlot = "weapon" | "armor" | "accessory";

// 컨셉 = 같은 부위 안에서 빌드 결을 가르는 축.
// 부위에 종속 — str/dex/int 는 무기, heavy/light 는 방어, luck/mana 는 장신.
export type V2EquipConcept =
  | "str"
  | "dex"
  | "int"
  | "heavy"
  | "light"
  | "luck"
  | "mana";

export type V2EquipTier = 1 | 2 | 3 | 4 | 5;

// PR-2: 35종.
export type V2EquipmentId =
  // 무기-힘 (str/atk)
  | "v2_iron_sword"
  | "v2_steel_sword"
  | "v2_greatsword"
  | "v2_silver_sword"
  | "v2_mithril_sword"
  // 무기-민 (dex/atk/crit)
  | "v2_wooden_bow"
  | "v2_recurve_bow"
  | "v2_horn_bow"
  | "v2_silver_bow"
  | "v2_starsong_bow"
  // 무기-지 (int/atk/mp)
  | "v2_oak_staff"
  | "v2_runed_staff"
  | "v2_obsidian_staff"
  | "v2_silver_staff"
  | "v2_starlit_staff"
  // 방어-중갑 (vit/def)
  | "v2_chain_mail"
  | "v2_plate_armor"
  | "v2_full_plate"
  | "v2_silver_plate"
  | "v2_mithril_plate"
  // 방어-경갑 (dex/def/eva)
  | "v2_leather_armor"
  | "v2_studded_leather"
  | "v2_shadow_cloak"
  | "v2_silken_armor"
  | "v2_windweave_cloak"
  // 장신-운 (luk/crit)
  | "v2_silver_ring"
  | "v2_gold_ring"
  | "v2_lucky_charm"
  | "v2_stardust_ring"
  | "v2_fate_ring"
  // 장신-마법 (int/mp)
  | "v2_jade_amulet"
  | "v2_rune_pendant"
  | "v2_crystal_amulet"
  | "v2_starlight_pendant"
  | "v2_mana_essence";

// V2_EQUIPMENT.stats = EquipBonus (6스탯 + atk/def) + v2 추가 파생 (crit/mp/eva/hp).
//   - EquipBonus 부분 → derive 의 기존 합산 경로 (v2ToDeriveItem 의 bonus 필드)
//   - 추가 파생 부분 → derivePlayerCombatV2 가 derive 결과 player 에 후-가산.
//
// 단위:
//   - atk/def, 6스탯: flat 정수
//   - crit, eva: 퍼센트 정수 (예: crit=3 → critChancePct +3)
//   - mp, hp: flat 정수
export type V2EquipDerivedExtras = {
  /** critChancePct 후-가산, 퍼센트 정수. */
  crit?: number;
  /** maxMp 후-가산, flat. */
  mp?: number;
  /** evasionPct 후-가산, 퍼센트 정수 (EVASION_PCT_CAP 클램프 유지). */
  eva?: number;
  /** maxHp 후-가산, flat (PR-2 는 미사용, 미래 보존). */
  hp?: number;
};

export type V2EquipStats = EquipBonus & V2EquipDerivedExtras;

export type V2Equipment = {
  id: V2EquipmentId;
  slot: V2EquipSlot;
  concept: V2EquipConcept;
  tier: V2EquipTier;
  name: string;
  description: string;
  stats: V2EquipStats;
};

// V2_EQUIPMENT — 35종, 컨셉×티어 그리드. 곡선은 컨셉별로 명시.
export const V2_EQUIPMENT: Record<V2EquipmentId, V2Equipment> = {
  // ── 무기-힘 (str/atk) ─────────────────────────────
  v2_iron_sword: {
    id: "v2_iron_sword",
    slot: "weapon",
    concept: "str",
    tier: 1,
    name: "철검",
    description: "흔한 한손검. 무난한 무게와 균형.",
    stats: { str: 25, atk: 3 },
  },
  v2_steel_sword: {
    id: "v2_steel_sword",
    slot: "weapon",
    concept: "str",
    tier: 2,
    name: "강철검",
    description: "단단한 강철 한손검. 한 손에 묵직하다.",
    stats: { str: 45, atk: 5 },
  },
  v2_greatsword: {
    id: "v2_greatsword",
    slot: "weapon",
    concept: "str",
    tier: 3,
    name: "한타검",
    description: "두 손으로 거머쥐는 큰 검. 일격의 무게가 다르다.",
    stats: { str: 70, atk: 8 },
  },
  v2_silver_sword: {
    id: "v2_silver_sword",
    slot: "weapon",
    concept: "str",
    tier: 4,
    name: "은검",
    description: "은으로 벼린 검. 옅게 빛을 낸다.",
    stats: { str: 100, atk: 12 },
  },
  v2_mithril_sword: {
    id: "v2_mithril_sword",
    slot: "weapon",
    concept: "str",
    tier: 5,
    name: "미스릴검",
    description: "오래된 별빛이 어린 미스릴 검.",
    stats: { str: 140, atk: 18 },
  },

  // ── 무기-민 (dex/atk/crit) ───────────────────────
  v2_wooden_bow: {
    id: "v2_wooden_bow",
    slot: "weapon",
    concept: "dex",
    tier: 1,
    name: "목궁",
    description: "참나무로 깎은 활. 가볍지만 사정거리 짧다.",
    stats: { dex: 20, atk: 2 },
  },
  v2_recurve_bow: {
    id: "v2_recurve_bow",
    slot: "weapon",
    concept: "dex",
    tier: 2,
    name: "합성궁",
    description: "휘어 만든 합성궁. 사거리가 늘었다.",
    stats: { dex: 40, atk: 4, crit: 2 },
  },
  v2_horn_bow: {
    id: "v2_horn_bow",
    slot: "weapon",
    concept: "dex",
    tier: 3,
    name: "각궁",
    description: "뿔과 힘줄을 덧대 만든 강한 활.",
    stats: { dex: 60, atk: 6, crit: 3 },
  },
  v2_silver_bow: {
    id: "v2_silver_bow",
    slot: "weapon",
    concept: "dex",
    tier: 4,
    name: "은활",
    description: "은으로 보강된 정교한 활.",
    stats: { dex: 90, atk: 9, crit: 5 },
  },
  v2_starsong_bow: {
    id: "v2_starsong_bow",
    slot: "weapon",
    concept: "dex",
    tier: 5,
    name: "별노래궁",
    description: "시위가 별의 노래처럼 떨린다.",
    stats: { dex: 125, atk: 14, crit: 7 },
  },

  // ── 무기-지 (int/atk/mp) ─────────────────────────
  v2_oak_staff: {
    id: "v2_oak_staff",
    slot: "weapon",
    concept: "int",
    tier: 1,
    name: "참나무 지팡이",
    description: "옹이가 굵은 지팡이. 무게가 손에 익는다.",
    stats: { int: 25, atk: 1 },
  },
  v2_runed_staff: {
    id: "v2_runed_staff",
    slot: "weapon",
    concept: "int",
    tier: 2,
    name: "룬 지팡이",
    description: "룬을 새긴 지팡이. 미세하게 따뜻하다.",
    stats: { int: 45, atk: 2, mp: 20 },
  },
  v2_obsidian_staff: {
    id: "v2_obsidian_staff",
    slot: "weapon",
    concept: "int",
    tier: 3,
    name: "흑요석 지팡이",
    description: "검은 유리처럼 매끄러운 지팡이.",
    stats: { int: 70, atk: 3, mp: 35 },
  },
  v2_silver_staff: {
    id: "v2_silver_staff",
    slot: "weapon",
    concept: "int",
    tier: 4,
    name: "은 지팡이",
    description: "은으로 감은 정교한 지팡이.",
    stats: { int: 100, atk: 5, mp: 55 },
  },
  v2_starlit_staff: {
    id: "v2_starlit_staff",
    slot: "weapon",
    concept: "int",
    tier: 5,
    name: "별빛 지팡이",
    description: "보석 끝에 별빛이 머문다.",
    stats: { int: 140, atk: 7, mp: 80 },
  },

  // ── 방어-중갑 (vit/def, spd 페널티) ──────────────
  // PR-5: 중갑 vs 경갑 트레이드오프 명확화 — 중갑 = 굳지만 느림.
  // spd 페널티는 다중공격(spd×N%)과 선공 판정에 영향.
  v2_chain_mail: {
    id: "v2_chain_mail",
    slot: "armor",
    concept: "heavy",
    tier: 1,
    name: "쇠사슬 갑옷",
    description: "고리를 엮은 갑옷. 무겁지만 든든하다.",
    stats: { vit: 25, def: 6, spd: -5 },
  },
  v2_plate_armor: {
    id: "v2_plate_armor",
    slot: "armor",
    concept: "heavy",
    tier: 2,
    name: "판금 갑옷",
    description: "철판을 덧댄 갑옷. 두꺼운 만큼 든든하다.",
    stats: { vit: 45, def: 10, spd: -10 },
  },
  v2_full_plate: {
    id: "v2_full_plate",
    slot: "armor",
    concept: "heavy",
    tier: 3,
    name: "완판 갑옷",
    description: "온몸을 두른 두꺼운 갑옷.",
    stats: { vit: 70, def: 15, spd: -15 },
  },
  v2_silver_plate: {
    id: "v2_silver_plate",
    slot: "armor",
    concept: "heavy",
    tier: 4,
    name: "은판 갑옷",
    description: "은판으로 덧댄 갑옷. 빛이 묻어난다.",
    stats: { vit: 100, def: 22, spd: -20 },
  },
  v2_mithril_plate: {
    id: "v2_mithril_plate",
    slot: "armor",
    concept: "heavy",
    tier: 5,
    name: "미스릴 갑옷",
    description: "가볍고 단단한 미스릴 갑옷.",
    stats: { vit: 140, def: 30, spd: -25 },
  },

  // ── 방어-경갑 (dex/def/eva) ──────────────────────
  v2_leather_armor: {
    id: "v2_leather_armor",
    slot: "armor",
    concept: "light",
    tier: 1,
    name: "가죽 갑옷",
    description: "들개 가죽을 손질해 만든 가벼운 갑옷.",
    stats: { dex: 10, def: 3 },
  },
  v2_studded_leather: {
    id: "v2_studded_leather",
    slot: "armor",
    concept: "light",
    tier: 2,
    name: "보강 가죽 갑옷",
    description: "쇠징으로 덧댄 단단한 가죽 갑옷.",
    stats: { dex: 25, def: 5, eva: 3 },
  },
  v2_shadow_cloak: {
    id: "v2_shadow_cloak",
    slot: "armor",
    concept: "light",
    tier: 3,
    name: "그림자 망토",
    description: "발걸음을 가리는 어두운 망토.",
    stats: { dex: 40, def: 7, eva: 5 },
  },
  v2_silken_armor: {
    id: "v2_silken_armor",
    slot: "armor",
    concept: "light",
    tier: 4,
    name: "은빛 비단 갑옷",
    description: "은사로 짠 가벼운 비단 갑옷.",
    stats: { dex: 60, def: 10, eva: 7 },
  },
  v2_windweave_cloak: {
    id: "v2_windweave_cloak",
    slot: "armor",
    concept: "light",
    tier: 5,
    name: "바람을 엮은 망토",
    description: "바람결을 짜 만든 가벼운 망토.",
    stats: { dex: 85, def: 13, eva: 10 },
  },

  // ── 장신-운 (luk/crit) ───────────────────────────
  v2_silver_ring: {
    id: "v2_silver_ring",
    slot: "accessory",
    concept: "luck",
    tier: 1,
    name: "은가락지",
    description: "흠집 없는 은반지. 광택이 곱다.",
    stats: { luk: 15 },
  },
  v2_gold_ring: {
    id: "v2_gold_ring",
    slot: "accessory",
    concept: "luck",
    tier: 2,
    name: "황금 반지",
    description: "두꺼운 황금 반지. 묵직하게 손에 머문다.",
    stats: { luk: 30, crit: 2 },
  },
  v2_lucky_charm: {
    id: "v2_lucky_charm",
    slot: "accessory",
    concept: "luck",
    tier: 3,
    name: "행운의 부적",
    description: "닳은 패에 글자가 빛난다.",
    stats: { luk: 50, crit: 3 },
  },
  v2_stardust_ring: {
    id: "v2_stardust_ring",
    slot: "accessory",
    concept: "luck",
    tier: 4,
    name: "별모래 반지",
    description: "잘게 빻은 별모래가 박혀 있다.",
    stats: { luk: 75, crit: 4 },
  },
  v2_fate_ring: {
    id: "v2_fate_ring",
    slot: "accessory",
    concept: "luck",
    tier: 5,
    name: "운명의 반지",
    description: "보는 각도마다 색이 바뀌는 반지.",
    stats: { luk: 110, crit: 6 },
  },

  // ── 장신-마법 (int/mp) ───────────────────────────
  v2_jade_amulet: {
    id: "v2_jade_amulet",
    slot: "accessory",
    concept: "mana",
    tier: 1,
    name: "옥 부적",
    description: "옥 조각에 끈을 꿴 부적. 묘하게 안심된다.",
    stats: { int: 15 },
  },
  v2_rune_pendant: {
    id: "v2_rune_pendant",
    slot: "accessory",
    concept: "mana",
    tier: 2,
    name: "룬 펜던트",
    description: "조그만 룬이 박힌 펜던트.",
    stats: { int: 30, mp: 25 },
  },
  v2_crystal_amulet: {
    id: "v2_crystal_amulet",
    slot: "accessory",
    concept: "mana",
    tier: 3,
    name: "수정 부적",
    description: "맑은 수정에 빛이 모인다.",
    stats: { int: 50, mp: 40 },
  },
  v2_starlight_pendant: {
    id: "v2_starlight_pendant",
    slot: "accessory",
    concept: "mana",
    tier: 4,
    name: "별빛 펜던트",
    description: "은사슬에 별빛이 묶여 있다.",
    stats: { int: 75, mp: 60 },
  },
  v2_mana_essence: {
    id: "v2_mana_essence",
    slot: "accessory",
    concept: "mana",
    tier: 5,
    name: "마나의 정수",
    description: "푸른 빛이 일렁이는 작은 결정.",
    stats: { int: 110, mp: 90 },
  },
};

// 슬롯별 catalog id 모음 — UI 가 슬롯 탭 표시할 때 사용.
export function v2EquipmentBySlot(slot: V2EquipSlot): V2Equipment[] {
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[])
    .map((id) => V2_EQUIPMENT[id])
    .filter((e) => e.slot === slot);
}

// 컨셉별 catalog — 같은 컨셉의 T1~T5 가 줄 서 나옴.
export function v2EquipmentByConcept(concept: V2EquipConcept): V2Equipment[] {
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[])
    .map((id) => V2_EQUIPMENT[id])
    .filter((e) => e.concept === concept)
    .sort((a, b) => a.tier - b.tier);
}

// 슬롯별로 그 슬롯의 컨셉 모음. UI 그룹화에 사용.
export const SLOT_CONCEPTS: Record<V2EquipSlot, V2EquipConcept[]> = {
  weapon: ["str", "dex", "int"],
  armor: ["heavy", "light"],
  accessory: ["luck", "mana"],
};

export const CONCEPT_LABELS: Record<V2EquipConcept, string> = {
  str: "힘",
  dex: "민첩",
  int: "지능",
  heavy: "중갑",
  light: "경갑",
  luck: "운",
  mana: "마법",
};

// stats 표시 공용 — atk/def 와 6스탯 + 추가 파생(crit/mp/eva/hp) 을 동일 자리에서 처리.
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
  "crit",
  "mp",
  "eva",
  "hp",
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
  crit: "치명",
  mp: "MP",
  eva: "회피",
  hp: "HP",
};

// 단위가 % 인 키 — UI 표시 시 "+3%" 처럼 후행 % 붙임.
export const V2_EQUIP_PERCENT_KEYS: ReadonlySet<V2EquipBonusKey> = new Set<V2EquipBonusKey>(
  ["crit", "eva"],
);

// 6스탯만 추리는 키셋 — derive 에서 atk/def 와 분리해야 할 때 사용.
export const V2_EQUIP_STAT_KEYS: readonly StatKey[] = [
  "str",
  "dex",
  "vit",
  "spd",
  "luk",
  "int",
];

// EquipBonus 부분만 추리는 키셋 — v2ToDeriveItem 의 bonus 필드 변환에 사용.
// 라이브 derive 의 자동 합산 경로를 그대로 타려면 EquipBonus 외 키는 제외해야 한다.
const EQUIP_BONUS_KEYS: readonly (keyof EquipBonus)[] = [
  "atk",
  "def",
  "str",
  "dex",
  "vit",
  "spd",
  "luk",
  "int",
];

/**
 * V2EquipStats 에서 EquipBonus 부분만 발췌.
 * 추가 파생(crit/mp/eva/hp)은 derivePlayerCombatV2 가 derive 결과에 후-가산.
 */
export function pickEquipBonus(stats: V2EquipStats): EquipBonus {
  const out: EquipBonus = {};
  for (const k of EQUIP_BONUS_KEYS) {
    const v = stats[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

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
