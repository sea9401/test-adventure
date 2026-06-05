// v2 장비 카탈로그.
//
// "갈아엎을수도있으니까" — 라이브 ITEMS catalog 와 분리해 v2_ 접두어로 자체 풀.
// 저장 위치: 별 save key `equipment.v2` (character.v2.equipped 와 충돌 X).
//
// PR-4a 전투 재설계 — 장비 데이터 모델을 **위력(power) / 무게(weight) / 옵션(options)** 으로
// 통합 (옛 atk/def/matk 직접표기 + 6스탯 token 폐기). 효과는 **슬롯별 분기**(derive):
//   - 무기: 위력 → 물리 공격력 + 마법 공격력 (둘 다). "무기는 빌드를 안 가린다."
//   - 갑옷/장갑/신발: 위력 → 물리 방어력 (물리 방어선 3슬롯).
//   - 반지/목걸이: 위력 → 마법 방어력 (장신구선 2슬롯).
//   - 무게 → 속도 −(선형). 빌드 트레이드오프(중갑 = 느림). 장갑·신발·장신구는 가볍다.
//   - 옵션(crit/eva/mp/hp) → 위력 외 flavor 차별화. derive 결과 player 에 후-가산.
//     장갑=치명 / 신발=회피 / 반지=치명 / 목걸이=MP 로 슬롯 시그니처를 가른다.
// 스탯 정체성(힘/민/지…)은 이제 **훈련 분배 + 직업**에서 나온다 — 장비는 스탯 token 을 안 준다.
//
// 슬롯 6 + 컨셉(같은 부위 안의 결): 무기 str/dex/int · 갑옷/장갑/신발 heavy/light · 반지 luck · 목걸이 mana.
// 티어 T1~T5. 3슬롯→6슬롯 확장(2026-06): 총량 중립(갑옷 유지·장갑/신발 소량def, 옛 장신구 분할).

import type { V2Element } from "@/adventure/data/v2/elements";

import { V2_EQUIPMENT } from "./v2EquipmentCatalog";
export { V2_EQUIPMENT };
// 6슬롯(2026-06): 무기 / 갑옷 / 장갑 / 신발 / 반지 / 목걸이.
//   - 물리 방어선: 갑옷(주) + 장갑(+크리) + 신발(+회피·경량) → 위력=물방.
//   - 장신구선: 반지(운, +크리) + 목걸이(마법, +MP) → 위력=마방.
export type V2EquipSlot =
  | "weapon"
  | "armor"
  | "gloves"
  | "boots"
  | "ring"
  | "necklace";

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

// 무기 종류(계파 게이트용) — 직업 계파 패시브가 "이 타입 착용 시에만" 발동(완전 비활성 폴백).
// 무기 슬롯에서만 의미. 미지정(undefined) = 일반 무기(어느 계파 게이트와도 매칭 X = 베이스만).
// docs/v2-job-spec-passives-plan.md §4. 전사 3종으로 시작, 직군 확장 시 추가.
export type V2WeaponType =
  // 전사 — docs §3-A
  | "greatsword" // 대검 — 광검(극딜)
  | "sword_shield" // 검방(검+방패, 단일 아이템) — 기사(방어·반격)
  | "rapier" // 세검 — 검투사(속도·출혈)
  // 무도가 — docs §3-B (P4b 뼈대, 계파명 보류)
  | "tonfa" // 봉권 — 철산류(맷집·반격)
  | "gauntlet" // 권갑 — 기공류(흡혈·지속)
  | "claw" // 권조 — 연환권(연타)
  // 마법사 — docs §3-C (P4b 뼈대)
  | "staff" // 지팡이 — 아크메이지(정통 원소마법)
  | "relic" // 성물 — 성직자(신성·치유)
  | "spellblade" // 마검 — 배틀메이지(마공+방어 하이브리드)
  // 도적 — docs §3-D (P4b 뼈대)
  | "bow" // 활 — 아쳐(원거리·다타)
  | "dagger" // 단검 — 어쌔신(치명타·다단)
  | "needle"; // 독침 — 맹독술사(중독 DoT)

// 희귀도 — 생략/"common" = 정규 카탈로그(상점·제작 대상). "unique" = 드랍 전용 유니크:
// 정규 컨셉×티어 그리드 밖의 사이드그레이드(옵션 프로필로 슬롯 규칙을 깬다). 상점 구매·제작
// 불가, 던전 초저확률 드랍 전용. Phase 2 에서 실제 유니크를 populate (지금은 0종).
export type V2EquipRarity = "common" | "unique";

// 55종 (무기 15 · 갑옷 10 · 장갑 10 · 신발 10 · 반지 5 · 목걸이 5).
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
  // 계파 스타터 무기 (전직 지급, weaponType 게이트용) — 수치 임시. 대검은 v2_greatsword 재사용.
  | "v2_starter_sword_shield"
  | "v2_starter_rapier"
  | "v2_starter_gauntlet"
  | "v2_starter_claw"
  | "v2_starter_staff"
  | "v2_starter_bow"
  | "v2_starter_dagger"
  // 계파 무기 정규 라인 (상점 T2~T5) — 5타입(greatsword/bow/staff 는 기존 라인 태그 재활용)
  | "v2_guard_blade"
  | "v2_knight_blade"
  | "v2_royal_blade"
  | "v2_paladin_blade"
  | "v2_duel_rapier"
  | "v2_swift_rapier"
  | "v2_master_rapier"
  | "v2_gale_rapier"
  | "v2_brawl_gauntlet"
  | "v2_fighter_gauntlet"
  | "v2_ironfist_gauntlet"
  | "v2_vajra_gauntlet"
  | "v2_beast_claw"
  | "v2_keen_claw"
  | "v2_fierce_claw"
  | "v2_dragon_claw"
  | "v2_steel_dagger"
  | "v2_assassin_dagger"
  | "v2_shadow_dagger"
  | "v2_toxic_dagger"
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
  // 장갑-중갑 (heavy/def/crit)
  | "v2_iron_gauntlets"
  | "v2_steel_gauntlets"
  | "v2_plate_gauntlets"
  | "v2_silver_gauntlets"
  | "v2_mithril_gauntlets"
  // 장갑-경갑 (light/def/crit)
  | "v2_leather_gloves"
  | "v2_studded_gloves"
  | "v2_shadow_gloves"
  | "v2_silken_gloves"
  | "v2_windweave_gloves"
  // 신발-중갑 (heavy/def/eva)
  | "v2_iron_boots"
  | "v2_steel_boots"
  | "v2_plate_boots"
  | "v2_silver_boots"
  | "v2_mithril_boots"
  // 신발-경갑 (light/def/eva)
  | "v2_leather_boots"
  | "v2_studded_boots"
  | "v2_shadow_boots"
  | "v2_silken_boots"
  | "v2_windweave_boots"
  // 반지-운 (luck/마방/crit)
  | "v2_silver_ring"
  | "v2_gold_ring"
  | "v2_lucky_charm"
  | "v2_stardust_ring"
  | "v2_fate_ring"
  // 목걸이-마법 (mana/마방/mp)
  | "v2_jade_amulet"
  | "v2_rune_pendant"
  | "v2_crystal_amulet"
  | "v2_starlight_pendant"
  | "v2_mana_essence"
  // 들판 제작 전용 (craftOnly) — 들판 재료 레시피로만. 상점·드랍 제외.
  //   무기/목걸이 4종 + 들가죽 세트 3종(경갑, setId:"field_leather").
  | "v2_meadow_bow"
  | "v2_spider_venom_dagger"
  | "v2_wolffang_staff"
  | "v2_fang_necklace"
  | "v2_field_leather_armor"
  | "v2_field_leather_gloves"
  | "v2_field_leather_boots"
  // 유니크 (드랍 전용, rarity:"unique") — 정규 컨셉×티어 그리드 밖 사이드그레이드. Phase 2 투입.
  | "v2_uniq_shadow_garb"
  | "v2_uniq_trickster_boots"
  | "v2_uniq_giant_fist"
  | "v2_uniq_berserker_fang"
  | "v2_uniq_starcleaver"
  | "v2_uniq_sage_seal";

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
  /** 무기 종류 — 계파 패시브 게이트(docs/v2-job-spec-passives-plan.md §4). 무기 슬롯만 의미.
   *  미지정 = 일반 무기(계파 게이트 매칭 X). */
  weaponType?: V2WeaponType;
  /** 희귀도. 생략/"common" = 정규(상점·제작). "unique" = 드랍 전용(상점·제작·그리드 제외). */
  rarity?: V2EquipRarity;
  /** 제작 전용 — true 면 상점 비매품·정규 드랍 제외(레시피로만 획득). 분해는 가능. */
  craftOnly?: boolean;
  /** 계파 스타터 — true 면 전직 지급 전용. 정규 그리드·상점·드랍 제외(craftOnly 와 동류 off-grid). */
  starterOnly?: boolean;
  /** 세트 id — 같은 세트 조각을 전부 장착하면 세트 보너스(V2_EQUIP_SETS). 없으면 세트 무관. */
  setId?: string;
};

// 마을 상점 판매가 — T1~T5 전부 판매. ×6 가파른 곡선 (각 티어 다음이 6배).
// 부위별 곱: 무기 ×1.5, 갑옷 ×1.0, 장갑/신발 ×0.6, 반지/목걸이 ×0.5.
//   T1 base 300   → 무기 450 / 갑옷 300 / 장갑·신발 180 / 반지·목걸이 150
//   T5 base 388.8k → 무기 583.2k / 갑옷 388.8k / 장갑·신발 233.28k / 반지·목걸이 194.4k
// 2026-06-03 ~40% 인하(base ×0.6) — 위력 −15% 동반. 판매가는 구매가 5% 라 자동 연동.
const SHOP_TIER_BASE: Record<V2EquipTier, number> = {
  1: 300,
  2: 1800,
  3: 10800,
  4: 64800,
  5: 388800,
};
const SHOP_SLOT_MULT: Record<V2EquipSlot, number> = {
  weapon: 1.5,
  armor: 1.0,
  gloves: 0.6,
  boots: 0.6,
  ring: 0.5,
  necklace: 0.5,
};
export function shopPriceFor(
  tier: V2EquipTier,
  slot: V2EquipSlot,
): number | undefined {
  const base = SHOP_TIER_BASE[tier];
  if (base == null) return undefined;
  return base * SHOP_SLOT_MULT[slot];
}

// 유니크·제작전용은 상점 비매품 → undefined. 그 외는 (티어, 슬롯) 곡선.
export function shopPriceOf(item: V2Equipment): number | undefined {
  if (item.rarity === "unique" || item.craftOnly || item.starterOnly)
    return undefined;
  return shopPriceFor(item.tier, item.slot);
}

// 유니크 여부 — 상점/제작/그리드 제외 판정에 공용.
export function isUnique(item: V2Equipment): boolean {
  return item.rarity === "unique";
}

// ── 계파 무기 게이트 (docs/v2-job-spec-passives-plan.md §4) ──────────────────
// 직업 계파 패시브가 "특정 무기 종류 착용 시에만" 발동(완전 비활성 폴백). derive 가 장착 무기의
// 종류를 이 헬퍼로 판정해 계파 패시브 적용 여부를 가른다. 순수 함수(데이터 조회) — P1 토대.

/** 장착 무기(카탈로그 id)의 종류. 미장착/일반 무기(타입 없음)면 undefined. */
export function weaponTypeOf(
  weaponId: V2EquipmentId | undefined | null,
): V2WeaponType | undefined {
  if (!weaponId) return undefined;
  return V2_EQUIPMENT[weaponId]?.weaponType;
}

/** 계파 무기 게이트 — 장착 무기가 요구 종류와 일치하는지. required 없으면 게이트 없음(항상 통과). */
export function weaponGateOpen(
  weaponId: V2EquipmentId | undefined | null,
  required: V2WeaponType | undefined,
): boolean {
  if (!required) return true;
  return weaponTypeOf(weaponId) === required;
}

// === 장비 세트 ======================================================
// 한 세트의 조각을 전부 장착하면 보너스(옵션 후-가산, aggregateV2Equipment 에서 적용).
export type V2EquipSet = {
  id: string;
  name: string;
  pieces: readonly V2EquipmentId[];
  /** 전 조각 장착 시 후-가산 보너스. V2EquipOptions 형태(crit/eva/mp/hp) 재사용. */
  bonus: Readonly<V2EquipOptions>;
};

export const V2_EQUIP_SETS: readonly V2EquipSet[] = [
  {
    id: "field_leather",
    name: "들가죽 세트",
    pieces: [
      "v2_field_leather_armor",
      "v2_field_leather_gloves",
      "v2_field_leather_boots",
    ],
    bonus: { eva: 3, hp: 20 },
  },
];

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
  gloves: ["heavy", "light"],
  boots: ["heavy", "light"],
  ring: ["luck"],
  necklace: ["mana"],
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

// 적용 스탯 — 개체 굴림(V2EquipRoll) 있으면 그 값, 없으면 카탈로그(상점 구매·옛 데이터·옵션
// 없는 아이템). 옵션은 **카탈로그 키로 스코프 + per-key 병합** — 카탈로그에 없는 옵션은
// (손상/변조 세이브라도) 주입 안 하고, 카탈로그 옵션이 굴림에서 누락돼도 떨어뜨리지 않음.
// derive·표시·UI 공용 단일 source (V2EquipRoll 타입은 아래에 선언, 타입 호이스팅으로 참조 가능).
export function effectiveStats(
  item: V2Equipment,
  roll: V2EquipRoll | undefined,
): { power: number; weight: number; options?: V2EquipOptions } {
  if (!roll) {
    return { power: item.power, weight: item.weight, options: item.options };
  }
  let options = item.options;
  if (item.options) {
    const merged: V2EquipOptions = {};
    for (const k of V2_EQUIP_OPTION_KEYS) {
      const cv = item.options[k];
      if (cv == null) continue;
      merged[k] = roll.options?.[k] ?? cv;
    }
    options = merged;
  }
  return { power: roll.power, weight: roll.weight, options };
}

// 장비 → {라벨, 값} 행 배열. 위력 → 무게 → 옵션 순. 0 값은 건너뜀.
// roll 주면 개체 굴림값 표시(보유템), 없으면 카탈로그(상점·제작 미리보기). 단일 source.
export function v2EquipStatRows(
  item: V2Equipment,
  roll?: V2EquipRoll,
): V2EquipStatRow[] {
  const eff = effectiveStats(item, roll);
  const out: V2EquipStatRow[] = [];
  if (eff.power) {
    out.push({ label: "위력", value: `+${eff.power}` });
  }
  if (eff.weight) {
    out.push({ label: "무게", value: `${eff.weight}` });
  }
  const opts = eff.options ?? {};
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
export function v2EquipStatEntries(item: V2Equipment, roll?: V2EquipRoll): string[] {
  return v2EquipStatRows(item, roll).map((r) => `${r.label} ${r.value}`);
}

// ─────────────────────────────────────────────────────────────────────
// equipment.v2 save 파싱 — owned/equipped 정합 보정.
//
// 라우트(GET·equip·grant) 와 derivePlayerCombatV2 가 공유한다. v2Equipment.ts 가
// catalog 의 단일 source 이므로 파싱도 여기에 두는 게 자연스럽다.

// 획득(드랍/제작) 시 굴린 개체 스탯 — 카탈로그 기준값 ±편차(위력·무게·옵션). 등급/이름 없음.
// 상점 구매는 굴림 없음(정가 고정). per-id 저장 — id당 한 굴림 공유,
// 0개 되면 삭제(재획득 시 재굴림). 굴림 없으면 derive·UI 가 카탈로그 값 사용.
export type V2EquipRoll = {
  power: number;
  weight: number;
  options?: V2EquipOptions;
};

export type EquipmentSave = {
  owned?: unknown;
  equipped?: unknown;
  // 옛 id별 굴림맵 — 개체(instance) 모델로 마이그 후 미사용. 파싱 시 옛 세이브 변환에만 읽음.
  statRolls?: unknown;
};

// 장비 개체(instance) — 같은 카탈로그 id 라도 개별 굴림을 갖는 한 자루. iid 로 식별.
//   iid: 고유 식별자(획득 시 생성, 재사용 금지) · id: 카탈로그 id · roll: 개체 굴림(없으면 카탈로그값).
export type V2EquipInstance = {
  iid: string;
  id: V2EquipmentId;
  roll?: V2EquipRoll;
};

// 개체 iid 생성 — 서버/클라 공용. crypto.randomUUID 우선, 없으면 폴백.
export function genEquipIid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `eq_${c.randomUUID()}`;
  return `eq_${Date.now().toString(36)}_${Math.floor(
    Math.random() * 1e9,
  ).toString(36)}`;
}

// 계파 전직 지급용 스타터 무기 — weaponType → 무기 id. 통합 후 쓰는 8종만 매핑
// (tonfa/spellblade/relic/needle 은 통합돼 미사용 → undefined: 지급 skip). 대검은 기존 v2_greatsword 재사용.
export function starterWeaponForType(
  type: V2WeaponType,
): V2EquipmentId | undefined {
  switch (type) {
    case "greatsword":
      return "v2_greatsword";
    case "sword_shield":
      return "v2_starter_sword_shield";
    case "rapier":
      return "v2_starter_rapier";
    case "gauntlet":
      return "v2_starter_gauntlet";
    case "claw":
      return "v2_starter_claw";
    case "staff":
      return "v2_starter_staff";
    case "bow":
      return "v2_starter_bow";
    case "dagger":
      return "v2_starter_dagger";
    default:
      return undefined;
  }
}

const VALID_IDS: ReadonlySet<string> = new Set(Object.keys(V2_EQUIPMENT));
const VALID_SLOTS_SET: ReadonlySet<V2EquipSlot> = new Set([
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
]);

// 굴림 1건 정규화 — power(≥1)/weight(≥0)/options(유효 키·정수)만. 불량이면 undefined(카탈로그값).
function parseEquipRoll(val: unknown): V2EquipRoll | undefined {
  if (!val || typeof val !== "object") return undefined;
  const r = val as { power?: unknown; weight?: unknown; options?: unknown };
  if (typeof r.power !== "number" || !Number.isFinite(r.power)) return undefined;
  if (typeof r.weight !== "number" || !Number.isFinite(r.weight)) return undefined;
  const roll: V2EquipRoll = {
    power: Math.max(1, Math.floor(r.power)),
    weight: Math.max(0, Math.floor(r.weight)),
  };
  if (r.options && typeof r.options === "object") {
    const opts: V2EquipOptions = {};
    const rawOpts = r.options as Record<string, unknown>;
    for (const k of V2_EQUIP_OPTION_KEYS) {
      const ov = rawOpts[k];
      if (typeof ov === "number" && Number.isFinite(ov)) opts[k] = Math.floor(ov);
    }
    if (Object.keys(opts).length > 0) roll.options = opts;
  }
  return roll;
}

// equipment.v2 파싱 — 개체(instance) 모델. 옛 {owned:id[], statRolls, equipped:slot→id} 를
// 자동 비파괴 마이그: 각 id 등장 → 개체 1개, 굴림은 옛 statRolls[id] 공유값을 이식(현재 스탯
// 보존), equipped id → 해당 id의 개체 iid. 마이그 iid 는 결정적(`id~n`)이라 쓰기 전 반복 파싱에도
// 안정적. 신 형식은 그대로 검증. 카탈로그 슬롯(item.slot) 기준 배치(저장 슬롯 키 불신).
export function parseEquipmentSave(raw: unknown): {
  owned: V2EquipInstance[];
  equipped: Partial<Record<V2EquipSlot, string>>;
} {
  const v = (raw ?? {}) as EquipmentSave;
  const statRollsRaw =
    v.statRolls && typeof v.statRolls === "object"
      ? (v.statRolls as Record<string, unknown>)
      : {};

  const owned: V2EquipInstance[] = [];
  const byIid = new Map<string, V2EquipInstance>();
  const idSeq = new Map<string, number>();
  const ownedRaw = Array.isArray(v.owned) ? v.owned : [];
  for (const entry of ownedRaw) {
    if (typeof entry === "string") {
      // 옛 형식 — id 문자열. 개체로 변환(굴림은 옛 공유맵에서 이식).
      if (!VALID_IDS.has(entry)) continue;
      const id = entry as V2EquipmentId;
      const seq = idSeq.get(id) ?? 0;
      idSeq.set(id, seq + 1);
      const iid = `${id}~${seq}`;
      if (byIid.has(iid)) continue;
      const inst: V2EquipInstance = {
        iid,
        id,
        roll: parseEquipRoll(statRollsRaw[id]),
      };
      owned.push(inst);
      byIid.set(iid, inst);
    } else if (entry && typeof entry === "object") {
      // 신 형식 — {iid, id, roll?}.
      const e = entry as { iid?: unknown; id?: unknown; roll?: unknown };
      if (typeof e.id !== "string" || !VALID_IDS.has(e.id)) continue;
      const id = e.id as V2EquipmentId;
      let iid = typeof e.iid === "string" && e.iid.length > 0 ? e.iid : "";
      // 누락/중복 iid 는 마이그와 같은 결정적 스킴(`id~n`)으로 복구 — 랜덤이면 쓰기 전 반복
      // 파싱에서 iid 가 매번 달라져 equip/sell 이 not_owned 로 깨지는 footgun 차단(read=write 안정).
      if (!iid || byIid.has(iid)) {
        do {
          const seq = idSeq.get(id) ?? 0;
          idSeq.set(id, seq + 1);
          iid = `${id}~${seq}`;
        } while (byIid.has(iid));
      }
      const inst: V2EquipInstance = { iid, id, roll: parseEquipRoll(e.roll) };
      owned.push(inst);
      byIid.set(iid, inst);
    }
  }

  // equipped — 슬롯→iid. 옛(slot→id) 흡수: id 면 그 id 의 미배정 개체 하나를 잡는다.
  const equipped: Partial<Record<V2EquipSlot, string>> = {};
  const usedIid = new Set<string>();
  const freeById = new Map<string, V2EquipInstance[]>();
  for (const inst of owned) {
    const arr = freeById.get(inst.id) ?? [];
    arr.push(inst);
    freeById.set(inst.id, arr);
  }
  const equippedRaw =
    v.equipped && typeof v.equipped === "object"
      ? (v.equipped as Record<string, unknown>)
      : {};
  for (const val of Object.values(equippedRaw)) {
    if (typeof val !== "string") continue;
    let inst: V2EquipInstance | undefined;
    if (byIid.has(val) && !usedIid.has(val)) {
      inst = byIid.get(val);
    } else if (VALID_IDS.has(val)) {
      const q = freeById.get(val);
      while (q && q.length > 0) {
        const cand = q.shift();
        if (cand && !usedIid.has(cand.iid)) {
          inst = cand;
          break;
        }
      }
    }
    if (!inst) continue;
    const item = V2_EQUIPMENT[inst.id];
    if (!VALID_SLOTS_SET.has(item.slot)) continue;
    if (equipped[item.slot]) continue; // 슬롯당 하나
    equipped[item.slot] = inst.iid;
    usedIid.add(inst.iid);
  }

  return { owned, equipped };
}

// 장착 개체 → aggregateV2Equipment 입력(슬롯→id, id→굴림)으로 해석.
// aggregate 시그니처를 인스턴스 모델과 무관하게 유지하기 위한 어댑터(각 id 는 슬롯이 1개라 충돌 없음).
export function resolveEquippedForAggregate(
  owned: V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
): {
  equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>;
  statRolls: Partial<Record<V2EquipmentId, V2EquipRoll>>;
} {
  const byIid = new Map(owned.map((i) => [i.iid, i]));
  const eq: Partial<Record<V2EquipSlot, V2EquipmentId>> = {};
  const rolls: Partial<Record<V2EquipmentId, V2EquipRoll>> = {};
  for (const [slot, iid] of Object.entries(equipped) as [
    V2EquipSlot,
    string,
  ][]) {
    const inst = byIid.get(iid);
    if (!inst) continue;
    eq[slot] = inst.id;
    if (inst.roll) rolls[inst.id] = inst.roll;
  }
  return { equipped: eq, statRolls: rolls };
}

// 개체 배열에서 iid 로 1개 제거(없으면 원본 그대로) + 제거된 개체 반환. 처분(판매/분해) 공용.
export function removeInstance(
  owned: V2EquipInstance[],
  iid: string,
): { owned: V2EquipInstance[]; removed: V2EquipInstance | undefined } {
  const idx = owned.findIndex((i) => i.iid === iid);
  if (idx < 0) return { owned, removed: undefined };
  const next = owned.slice();
  const [removed] = next.splice(idx, 1);
  return { owned: next, removed };
}
