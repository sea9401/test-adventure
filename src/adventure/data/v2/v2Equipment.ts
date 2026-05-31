// v2 장비 카탈로그.
//
// "갈아엎을수도있으니까" — 라이브 ITEMS catalog 와 분리해 v2_ 접두어로 자체 풀.
// 저장 위치: 별 save key `equipment.v2` (character.v2.equipped 와 충돌 X).
//
// PR-4a 전투 재설계 — 장비 데이터 모델을 **위력(power) / 무게(weight) / 옵션(options)** 으로
// 통합 (옛 atk/def/matk 직접표기 + 6스탯 token 폐기). 효과는 **슬롯별 분기**(derive):
//   - 무기: 위력 → 물리 공격력 + 마법 공격력 (둘 다). "무기는 빌드를 안 가린다."
//   - 방어구: 위력 → 물리 방어력
//   - 장신구: 위력 → 물리 방어력 + 마법 방어력
//   - 무게 → 속도 −(선형). 빌드 트레이드오프(중갑 = 느림).
//   - 옵션(crit/eva/mp/hp) → 위력 외 flavor 차별화. derive 결과 player 에 후-가산.
// 스탯 정체성(힘/민/지…)은 이제 **훈련 분배 + 직업**에서 나온다 — 장비는 스탯 token 을 안 준다.
//
// 컨셉 7갈래(같은 부위 안의 결): 무기 str/dex/int · 방어 heavy/light · 장신 luck/mana.
// 티어 T1~T5. 내구도/수리는 PR-4b. 위력·무게 계수는 sim 캘리브(PR-8).

import type { V2Element } from "@/adventure/data/v2/elements";

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

// 옵션 — 위력/무게 외 flavor 차별화 효과. derive 가 결과 player 에 후-가산.
//   crit, eva: 퍼센트 정수 (예: crit=2 → critChancePct +2)
//   mp, hp: flat 정수
export type V2EquipOptions = {
  /** critChancePct 후-가산, 퍼센트 정수. */
  crit?: number;
  /** evasionPct 후-가산, 퍼센트 정수 (EVASION_PCT_CAP 클램프 유지). */
  eva?: number;
  /** maxMp 후-가산, flat. */
  mp?: number;
  /** maxHp 후-가산, flat. */
  hp?: number;
};

export const V2_EQUIP_OPTION_KEYS: readonly (keyof V2EquipOptions)[] = [
  "crit",
  "eva",
  "mp",
  "hp",
];

export type V2Equipment = {
  id: V2EquipmentId;
  slot: V2EquipSlot;
  concept: V2EquipConcept;
  tier: V2EquipTier;
  name: string;
  description: string;
  /** 위력 — 슬롯별 분기(무기=물공+마공 / 방어구=물방 / 장신구=물방+마방). 항상 ≥ 1. */
  power: number;
  /** 무게 — 속도 −(선형, derive). 0 = 패널티 없음(장신구·경갑). */
  weight: number;
  /** flavor 옵션 — 위력/무게 외 부가 효과. 없으면 생략. */
  options?: V2EquipOptions;
  /** PR-5b 무기 속성 — 무기에 부여 시 평타/공격 속성을 이 속성으로(없으면 캐릭 속성).
   *  무기 슬롯만 의미 — 방어구·장신구의 element 는 무시. */
  element?: V2Element;
};

// 마을 상점 판매가 — T1~T5 전부 판매. ×6 가파른 곡선 (각 티어 다음이 6배).
// 부위별 곱: 무기 ×1.5, 방어 ×1.0, 장신 ×0.5.
//   T1 base 500   → 무기 750     / 방어 500    / 장신 250
//   T2 base 3000  → 무기 4,500   / 방어 3,000  / 장신 1,500
//   T3 base 18000 → 무기 27,000  / 방어 18,000 / 장신 9,000
//   T4 base 108k  → 무기 162,000 / 방어 108,000 / 장신 54,000
//   T5 base 648k  → 무기 972,000 / 방어 648,000 / 장신 324,000
const SHOP_TIER_BASE: Record<V2EquipTier, number> = {
  1: 500,
  2: 3000,
  3: 18000,
  4: 108000,
  5: 648000,
};
const SHOP_SLOT_MULT: Record<V2EquipSlot, number> = {
  weapon: 1.5,
  armor: 1.0,
  accessory: 0.5,
};
export function shopPriceFor(
  tier: V2EquipTier,
  slot: V2EquipSlot,
): number | undefined {
  const base = SHOP_TIER_BASE[tier];
  if (base == null) return undefined;
  return base * SHOP_SLOT_MULT[slot];
}

export function shopPriceOf(item: V2Equipment): number | undefined {
  return shopPriceFor(item.tier, item.slot);
}

// V2_EQUIPMENT — 35종, 컨셉×티어 그리드.
//   - 위력 = 옛 헤드라인(검·활 atk / 지팡이 matk / 방어구 def) 승계. 장신구는 신규 소량 위력
//     (물방+마방 이중 역할이라 작게). 무게·옵션은 컨셉 정체성으로 차별화.
//   - sim 캘리브(PR-8)에서 정식 튜닝.
export const V2_EQUIPMENT: Record<V2EquipmentId, V2Equipment> = {
  // ── 무기-힘 (위력 = 물공+마공, 중간 무게, 옵션 없음) ──────────────────
  // 검은 물리 무기지만 위력은 물/마 둘 다 먹인다(빌드 안 가림). str 정체성은 훈련 분배.
  v2_iron_sword: {
    id: "v2_iron_sword",
    slot: "weapon",
    concept: "str",
    tier: 1,
    name: "철검",
    description: "흔한 한손검. 무난한 무게와 균형.",
    power: 3,
    weight: 2,
  },
  v2_steel_sword: {
    id: "v2_steel_sword",
    slot: "weapon",
    concept: "str",
    tier: 2,
    name: "강철검",
    description: "단단한 강철 한손검. 한 손에 묵직하다.",
    power: 5,
    weight: 2,
    element: "fire",
  },
  v2_greatsword: {
    id: "v2_greatsword",
    slot: "weapon",
    concept: "str",
    tier: 3,
    name: "한타검",
    description: "두 손으로 거머쥐는 큰 검. 일격의 무게가 다르다.",
    power: 8,
    weight: 3,
    element: "earth",
  },
  v2_silver_sword: {
    id: "v2_silver_sword",
    slot: "weapon",
    concept: "str",
    tier: 4,
    name: "은검",
    description: "은으로 벼린 검. 옅게 빛을 낸다.",
    power: 11,
    weight: 3,
    element: "starlight",
  },
  v2_mithril_sword: {
    id: "v2_mithril_sword",
    slot: "weapon",
    concept: "str",
    tier: 5,
    name: "미스릴검",
    description: "오래된 별빛이 어린 미스릴 검.",
    power: 16,
    weight: 4,
    element: "void",
  },

  // ── 무기-민 (위력 = 물공+마공, 가벼움, 옵션 crit) ─────────────────────
  // 활은 가벼운 원거리 무기 — 무게 낮고 궁수 특유 치명 flavor.
  v2_wooden_bow: {
    id: "v2_wooden_bow",
    slot: "weapon",
    concept: "dex",
    tier: 1,
    name: "목궁",
    description: "참나무로 깎은 활. 가볍지만 사정거리 짧다.",
    power: 3,
    weight: 1,
  },
  v2_recurve_bow: {
    id: "v2_recurve_bow",
    slot: "weapon",
    concept: "dex",
    tier: 2,
    name: "합성궁",
    description: "휘어 만든 합성궁. 사거리가 늘었다.",
    power: 5,
    weight: 1,
    element: "wind",
    options: { crit: 1 },
  },
  v2_horn_bow: {
    id: "v2_horn_bow",
    slot: "weapon",
    concept: "dex",
    tier: 3,
    name: "각궁",
    description: "뿔과 힘줄을 덧대 만든 강한 활.",
    power: 7,
    weight: 1,
    element: "lightning",
    options: { crit: 1 },
  },
  v2_silver_bow: {
    id: "v2_silver_bow",
    slot: "weapon",
    concept: "dex",
    tier: 4,
    name: "은활",
    description: "은으로 보강된 정교한 활.",
    power: 10,
    weight: 2,
    element: "water",
    options: { crit: 2 },
  },
  v2_starsong_bow: {
    id: "v2_starsong_bow",
    slot: "weapon",
    concept: "dex",
    tier: 5,
    name: "별노래궁",
    description: "시위가 별의 노래처럼 떨린다.",
    power: 14,
    weight: 2,
    options: { crit: 2 },
    element: "starlight", // 별빛 무기.
  },

  // ── 무기-지 (위력 = 물공+마공, 가벼움, 옵션 mp) ───────────────────────
  // 지팡이도 위력으로 물/마 둘 다 먹인다. 마법사 정체성은 INT 분배 + 마법 스킬.
  // mp(자원 풀)는 마법 빌드 정체성이라 옵션으로 유지.
  v2_oak_staff: {
    id: "v2_oak_staff",
    slot: "weapon",
    concept: "int",
    tier: 1,
    name: "참나무 지팡이",
    description: "옹이가 굵은 지팡이. 무게가 손에 익는다.",
    power: 5,
    weight: 1,
    options: { mp: 8 },
  },
  v2_runed_staff: {
    id: "v2_runed_staff",
    slot: "weapon",
    concept: "int",
    tier: 2,
    name: "룬 지팡이",
    description: "룬을 새긴 지팡이. 미세하게 따뜻하다.",
    power: 9,
    weight: 1,
    element: "fire",
    options: { mp: 16 },
  },
  v2_obsidian_staff: {
    id: "v2_obsidian_staff",
    slot: "weapon",
    concept: "int",
    tier: 3,
    name: "흑요석 지팡이",
    description: "검은 유리처럼 매끄러운 지팡이.",
    power: 12,
    weight: 2,
    element: "void",
    options: { mp: 22 },
  },
  v2_silver_staff: {
    id: "v2_silver_staff",
    slot: "weapon",
    concept: "int",
    tier: 4,
    name: "은 지팡이",
    description: "은으로 감은 정교한 지팡이.",
    power: 13,
    weight: 2,
    element: "water",
    options: { mp: 28 },
  },
  v2_starlit_staff: {
    id: "v2_starlit_staff",
    slot: "weapon",
    concept: "int",
    tier: 5,
    name: "별빛 지팡이",
    description: "보석 끝에 별빛이 머문다.",
    power: 17,
    weight: 2,
    options: { mp: 36 },
    element: "starlight", // 별빛 무기.
  },

  // ── 방어-중갑 (위력 = 물방, 무거움, 옵션 없음) ────────────────────────
  // 무게 = 옛 spd 페널티 승계 — 중갑은 든든하지만 느리다(속도 트레이드오프).
  v2_chain_mail: {
    id: "v2_chain_mail",
    slot: "armor",
    concept: "heavy",
    tier: 1,
    name: "쇠사슬 갑옷",
    description: "고리를 엮은 갑옷. 무겁지만 든든하다.",
    power: 2,
    weight: 2,
  },
  v2_plate_armor: {
    id: "v2_plate_armor",
    slot: "armor",
    concept: "heavy",
    tier: 2,
    name: "판금 갑옷",
    description: "철판을 덧댄 갑옷. 두꺼운 만큼 든든하다.",
    power: 3,
    weight: 3,
  },
  v2_full_plate: {
    id: "v2_full_plate",
    slot: "armor",
    concept: "heavy",
    tier: 3,
    name: "완판 갑옷",
    description: "온몸을 두른 두꺼운 갑옷.",
    power: 5,
    weight: 5,
  },
  v2_silver_plate: {
    id: "v2_silver_plate",
    slot: "armor",
    concept: "heavy",
    tier: 4,
    name: "은판 갑옷",
    description: "은판으로 덧댄 갑옷. 빛이 묻어난다.",
    power: 7,
    weight: 7,
  },
  v2_mithril_plate: {
    id: "v2_mithril_plate",
    slot: "armor",
    concept: "heavy",
    tier: 5,
    name: "미스릴 갑옷",
    description: "가볍고 단단한 미스릴 갑옷.",
    power: 10,
    weight: 8,
  },

  // ── 방어-경갑 (위력 = 물방, 가벼움, 옵션 eva) ─────────────────────────
  v2_leather_armor: {
    id: "v2_leather_armor",
    slot: "armor",
    concept: "light",
    tier: 1,
    name: "가죽 갑옷",
    description: "들개 가죽을 손질해 만든 가벼운 갑옷.",
    power: 1,
    weight: 0,
  },
  v2_studded_leather: {
    id: "v2_studded_leather",
    slot: "armor",
    concept: "light",
    tier: 2,
    name: "보강 가죽 갑옷",
    description: "쇠징으로 덧댄 단단한 가죽 갑옷.",
    power: 2,
    weight: 0,
    options: { eva: 1 },
  },
  v2_shadow_cloak: {
    id: "v2_shadow_cloak",
    slot: "armor",
    concept: "light",
    tier: 3,
    name: "그림자 망토",
    description: "발걸음을 가리는 어두운 망토.",
    power: 2,
    weight: 1,
    options: { eva: 2 },
  },
  v2_silken_armor: {
    id: "v2_silken_armor",
    slot: "armor",
    concept: "light",
    tier: 4,
    name: "은빛 비단 갑옷",
    description: "은사로 짠 가벼운 비단 갑옷.",
    power: 3,
    weight: 1,
    options: { eva: 2 },
  },
  v2_windweave_cloak: {
    id: "v2_windweave_cloak",
    slot: "armor",
    concept: "light",
    tier: 5,
    name: "바람을 엮은 망토",
    description: "바람결을 짜 만든 가벼운 망토.",
    power: 4,
    weight: 1,
    options: { eva: 3 },
  },

  // ── 장신-운 (위력 = 물방+마방, 무게 0, 옵션 crit) ─────────────────────
  // 장신구 위력은 물/마 방어 이중 역할이라 작게. 운 장신구는 치명 flavor.
  v2_silver_ring: {
    id: "v2_silver_ring",
    slot: "accessory",
    concept: "luck",
    tier: 1,
    name: "은가락지",
    description: "흠집 없는 은반지. 광택이 곱다.",
    power: 1,
    weight: 0,
  },
  v2_gold_ring: {
    id: "v2_gold_ring",
    slot: "accessory",
    concept: "luck",
    tier: 2,
    name: "황금 반지",
    description: "두꺼운 황금 반지. 묵직하게 손에 머문다.",
    power: 1,
    weight: 0,
    options: { crit: 1 },
  },
  v2_lucky_charm: {
    id: "v2_lucky_charm",
    slot: "accessory",
    concept: "luck",
    tier: 3,
    name: "행운의 부적",
    description: "닳은 패에 글자가 빛난다.",
    power: 2,
    weight: 0,
    options: { crit: 1 },
  },
  v2_stardust_ring: {
    id: "v2_stardust_ring",
    slot: "accessory",
    concept: "luck",
    tier: 4,
    name: "별모래 반지",
    description: "잘게 빻은 별모래가 박혀 있다.",
    power: 2,
    weight: 0,
    options: { crit: 1 },
  },
  v2_fate_ring: {
    id: "v2_fate_ring",
    slot: "accessory",
    concept: "luck",
    tier: 5,
    name: "운명의 반지",
    description: "보는 각도마다 색이 바뀌는 반지.",
    power: 3,
    weight: 0,
    options: { crit: 2 },
  },

  // ── 장신-마법 (위력 = 물방+마방, 무게 0, 옵션 mp) ─────────────────────
  v2_jade_amulet: {
    id: "v2_jade_amulet",
    slot: "accessory",
    concept: "mana",
    tier: 1,
    name: "옥 부적",
    description: "옥 조각에 끈을 꿴 부적. 묘하게 안심된다.",
    power: 1,
    weight: 0,
  },
  v2_rune_pendant: {
    id: "v2_rune_pendant",
    slot: "accessory",
    concept: "mana",
    tier: 2,
    name: "룬 펜던트",
    description: "조그만 룬이 박힌 펜던트.",
    power: 1,
    weight: 0,
    options: { mp: 8 },
  },
  v2_crystal_amulet: {
    id: "v2_crystal_amulet",
    slot: "accessory",
    concept: "mana",
    tier: 3,
    name: "수정 부적",
    description: "맑은 수정에 빛이 모인다.",
    power: 2,
    weight: 0,
    options: { mp: 13 },
  },
  v2_starlight_pendant: {
    id: "v2_starlight_pendant",
    slot: "accessory",
    concept: "mana",
    tier: 4,
    name: "별빛 펜던트",
    description: "은사슬에 별빛이 묶여 있다.",
    power: 2,
    weight: 0,
    options: { mp: 20 },
  },
  v2_mana_essence: {
    id: "v2_mana_essence",
    slot: "accessory",
    concept: "mana",
    tier: 5,
    name: "마나의 정수",
    description: "푸른 빛이 일렁이는 작은 결정.",
    power: 3,
    weight: 0,
    options: { mp: 30 },
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

const OPTION_LABELS: Record<keyof V2EquipOptions, string> = {
  crit: "치명",
  eva: "회피",
  mp: "MP",
  hp: "HP",
};

// 단위가 % 인 옵션 키 — UI 표시 시 "+2%" 처럼 후행 % 붙임.
const OPTION_PERCENT_KEYS: ReadonlySet<keyof V2EquipOptions> = new Set<
  keyof V2EquipOptions
>(["crit", "eva"]);

// 장비 옵션 한 줄 — 라벨과 값(부호·단위 포함)을 분리해 들고 있다.
// 카드가 라벨(좌)·값(우) 행으로 그리려면 합친 문자열이 아니라 이 형태가 필요.
export type V2EquipStatRow = { label: string; value: string };

// 장비 → {라벨, 값} 행 배열. 위력 → 무게 → 옵션 순. 0 값은 건너뜀.
// 인벤토리·상점·아이템 카드가 공유하는 단일 source.
export function v2EquipStatRows(item: V2Equipment): V2EquipStatRow[] {
  const out: V2EquipStatRow[] = [];
  if (item.power) {
    out.push({ label: "위력", value: `+${item.power}` });
  }
  if (item.weight) {
    out.push({ label: "무게", value: `${item.weight}` });
  }
  const opts = item.options ?? {};
  for (const k of V2_EQUIP_OPTION_KEYS) {
    const v = opts[k];
    if (!v) continue;
    const unit = OPTION_PERCENT_KEYS.has(k) ? "%" : "";
    out.push({ label: OPTION_LABELS[k], value: `+${v}${unit}` });
  }
  return out;
}

// 표시 문자열 배열 ("위력 +14", "무게 2", "치명 +2%" 등) — 한 줄 인라인용.
// rows 를 합쳐 단일 source 유지.
export function v2EquipStatEntries(item: V2Equipment): string[] {
  return v2EquipStatRows(item).map((r) => `${r.label} ${r.value}`);
}

// ─────────────────────────────────────────────────────────────────────
// PR-4b 내구도 (durability) — 장비별 현재 내구도. 전투마다 닳고, 0 이면 장비 효과 비활성
// (파괴는 없음 — 위력·무게·옵션 전부 inert, 슬롯 비운 것과 동일). 수리(골드)로 복구.
// 자동전투라 "조용히 0 됨 → 캐릭 망가짐" 절벽 위험 → 경고 + 전투 전 수리 프롬프트(자동수리
// 옵트인)로 완화. 내구도는 per-id (중복 보유는 한 값 공유 — placeholder 단순화).

/** 내구도 최대치 (= 신품/수리 직후). 0~MAX. */
export const MAX_DURABILITY = 100;
/** 전투당 마모 — 승리 1, 패배 2 (패배가 더 닳음). 느낌·sim 캘리브 다이얼. */
export const DURABILITY_WEAR_WIN = 1;
export const DURABILITY_WEAR_LOSS = 2;
/** 전투 전 수리 프롬프트/경고 임계 (이하면 "낮음"). */
export const DURABILITY_LOW_THRESHOLD = 20;
/** 수리비 = 상점가 × 이 비율 × (소모분/MAX). 골드 싱크 다이얼. */
const REPAIR_COST_FRACTION = 0.15;

/** id 의 현재 내구도 (durability 맵에 없으면 풀충 MAX). 0~MAX 로 클램프. */
export function durabilityOf(
  durability: Partial<Record<V2EquipmentId, number>> | undefined,
  id: V2EquipmentId,
): number {
  const raw = durability?.[id];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return MAX_DURABILITY;
  return Math.max(0, Math.min(MAX_DURABILITY, Math.floor(raw)));
}

/** 내구도 0 = 비활성(broken). */
export function isBroken(dur: number): boolean {
  return dur <= 0;
}

/** 낮음(전투 전 프롬프트/경고 대상). */
export function isLowDurability(dur: number): boolean {
  return dur <= DURABILITY_LOW_THRESHOLD;
}

/** id 를 MAX 로 복구하는 수리비(골드). 이미 풀충이면 0. */
export function repairCostFor(
  id: V2EquipmentId,
  currentDurability: number,
): number {
  const item = V2_EQUIPMENT[id];
  const price = shopPriceOf(item) ?? 0;
  const missing = Math.max(0, MAX_DURABILITY - currentDurability);
  if (missing <= 0) return 0;
  return Math.ceil(price * REPAIR_COST_FRACTION * (missing / MAX_DURABILITY));
}

// ─────────────────────────────────────────────────────────────────────
// equipment.v2 save 파싱 — owned/equipped/durability 정합 보정.
//
// 라우트(GET·equip·grant) 와 derivePlayerCombatV2 가 공유한다. v2Equipment.ts 가
// catalog 의 단일 source 이므로 파싱도 여기에 두는 게 자연스럽다.

export type EquipmentSave = {
  owned?: unknown;
  equipped?: unknown;
  durability?: unknown;
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
  durability: Partial<Record<V2EquipmentId, number>>;
} {
  const v = (raw ?? {}) as EquipmentSave;
  const ownedRaw = Array.isArray(v.owned) ? v.owned : [];
  // 같은 id 중복 허용 — 배열 등장 횟수 = 보유 카운트. seen 은 equipped 유효성 검증용만.
  const owned: V2EquipmentId[] = [];
  const seen = new Set<string>();
  for (const id of ownedRaw) {
    if (typeof id !== "string" || !VALID_IDS.has(id)) continue;
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
  // 내구도 — 유효 id + 0~MAX 클램프만 보존. 없으면 풀충(durabilityOf 가 처리).
  const durabilityRaw =
    v.durability && typeof v.durability === "object" ? v.durability : {};
  const durability: Partial<Record<V2EquipmentId, number>> = {};
  for (const [id, val] of Object.entries(
    durabilityRaw as Record<string, unknown>,
  )) {
    if (!VALID_IDS.has(id)) continue;
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    durability[id as V2EquipmentId] = Math.max(
      0,
      Math.min(MAX_DURABILITY, Math.floor(val)),
    );
  }
  return { owned, equipped, durability };
}
