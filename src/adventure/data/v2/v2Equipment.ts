// v2 장비 카탈로그.
//
// "갈아엎을수도있으니까" — 라이브 ITEMS catalog 와 분리해 v2_ 접두어로 자체 풀.
// 저장 위치: 별 save key `equipment.v2` (character.v2.equipped 와 충돌 X).
//
// PR-4a 전투 재설계 — 장비 데이터 모델을 **위력(power) / 무게(weight) / 옵션(options)** 으로
// 통합 (옛 atk/def/matk 직접표기 + 6스탯 token 폐기). 효과는 **슬롯별 분기**(derive):
//   - 무기: 위력 → weaponType 별 공격력. 지팡이=마법 공격력, 그 외=물리 공격력.
//   - 갑옷/장갑/신발: 위력 → 물리 방어력 (물리 방어선 3슬롯).
//   - 반지/목걸이: 위력 → 마법 방어력 (장신구선 2슬롯).
//   - 무게 → 속도 −(선형). 빌드 트레이드오프(중갑 = 느림). 장갑·신발·장신구는 가볍다.
//   - 옵션(crit/eva/mp/hp) → 위력 외 flavor 차별화. derive 결과 player 에 후-가산.
//     장갑=치명 / 신발=회피 / 반지=치명 / 목걸이=MP 로 슬롯 시그니처를 가른다.
// 스탯 정체성(힘/민/지…)은 이제 **훈련 분배 + 직업**에서 나온다 — 장비는 스탯 token 을 안 준다.
//
// 슬롯 6 + 컨셉(같은 부위 안의 결): 무기 str/dex/int · 갑옷/장갑/신발 heavy/light · 반지 luck · 목걸이 mana.
// 티어 T1~T3. 3슬롯→6슬롯 확장(2026-06): 총량 중립(갑옷 유지·장갑/신발 소량def, 옛 장신구 분할).

import type { V2Element } from "@/adventure/data/v2/elements";

import { V2_EQUIPMENT } from "./v2EquipmentCatalog";
import { parseEnhance, type V2EnhanceState } from "./v2Enhance";
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

export type V2EquipTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// 무기 종류(전문화 게이트용) — 직업 전문화 패시브가 "이 타입 착용 시에만" 발동(완전 비활성 폴백).
// 무기 슬롯에서만 의미. 미지정(undefined) = 일반 무기(어느 전문화 게이트와도 매칭 X = 베이스만).
// docs/v2-job-spec-passives-plan.md §4. 12전문화가 쓰는 8종 — 무기 종류를 의도적으로 줄여 통합
//   (마법사 전 전문화=지팡이 / 도적=활·단검 / 무도가=권갑·권조). 봉권·성물·마검·독침은 미사용(제거).
// 무기 종류 — 일반 무기군 4종으로 통합(검방·권갑→대검, 세검·권조→단검). weaponType 8→4.
//   직업이 늘면 무기군은 나중에 다시 추가 가능. 전문화 게이트(requiredWeaponType)는 현재 휴면.
export type V2WeaponType =
  | "greatsword" // 대검 — 중량 근접(검방·권갑 흡수)
  | "staff" // 지팡이 — 마법
  | "bow" // 활 — 원거리
  | "dagger"; // 단검 — 경량/속공 근접(세검·권조 흡수)

// 희귀도 — 생략/"common" = 정규 카탈로그(상점·제작 대상). "unique" = 드랍 전용 유니크:
// 정규 컨셉×티어 그리드 밖의 사이드그레이드(옵션 프로필로 슬롯 규칙을 깬다). 상점 구매·제작
// 불가, 던전 초저확률 드랍 전용. Phase 2 에서 실제 유니크를 populate (지금은 0종).
export type V2EquipRarity = "common" | "unique";

// 55종 (무기 15 · 갑옷 10 · 장갑 10 · 신발 10 · 반지 5 · 목걸이 5).
export type V2EquipmentId =
  // 무기-힘 (str/atk)
  | "v2_iron_sword"
  | "v2_greatsword"
  | "v2_mithril_sword"
  // 무기-민 (dex/atk/crit)
  | "v2_wooden_bow"
  | "v2_horn_bow"
  | "v2_starsong_bow"
  // 무기-지 (int/atk/mp)
  | "v2_oak_staff"
  | "v2_obsidian_staff"
  | "v2_starlit_staff"
  // 전문화 스타터 무기 (전직 지급, weaponType 게이트용) — 수치 임시. 대검은 v2_greatsword 재사용.
  | "v2_starter_staff"
  | "v2_starter_bow"
  | "v2_starter_dagger"
  // 전문화 무기 정규 라인 (드랍 T2/T3, T1=전직 지급 스타터) — 5타입(greatsword/bow/staff 는 기존 라인 태그 재활용)
  | "v2_assassin_dagger"
  | "v2_toxic_dagger"
  // 방어-중갑 (vit/def)
  | "v2_chain_mail"
  | "v2_full_plate"
  | "v2_mithril_plate"
  // 방어-경갑 (dex/def/eva)
  | "v2_leather_armor"
  | "v2_shadow_cloak"
  | "v2_windweave_cloak"
  // 장갑 (light/def/crit) — 중갑/경갑 통합, 경갑 단일
  | "v2_leather_gloves"
  | "v2_shadow_gloves"
  | "v2_windweave_gloves"
  // 신발 (light/def/eva) — 중갑/경갑 통합, 경갑 단일
  | "v2_leather_boots"
  | "v2_shadow_boots"
  | "v2_windweave_boots"
  // 반지-운 (luck/마방/crit)
  | "v2_silver_ring"
  | "v2_lucky_charm"
  | "v2_fate_ring"
  // 목걸이-마법 (mana/마방/mp)
  | "v2_jade_amulet"
  | "v2_crystal_amulet"
  | "v2_mana_essence"
  // 길드 대장간 제작 전용 고유 장비(craftOnly) — 드랍/상점 제외, 레시피로만 획득.
  | "v2_crafted_oathblade"
  | "v2_crafted_gale_bow"
  | "v2_crafted_runic_staff"
  | "v2_crafted_master_ring"
  | "v2_crafted_ward_plate"
  | "v2_crafted_spark_gloves"
  | "v2_crafted_windstep_boots"
  | "v2_crafted_aether_necklace"
  | "v2_crafted_sunforge_blade"
  | "v2_crafted_aurora_crown"
  | "v2_crafted_bulwark_shield"
  | "v2_crafted_stormlance"
  | "v2_crafted_kingbreaker_axe"
  | "v2_crafted_astral_grimoire"
  // 들판 유니크(레거시 floor 1~5) 6종 삭제(2026-06-19, 초반 정리).
  // 보스 전용 유니크 (협동 보스 토벌 보상만, rarity:"unique") — coopBosses. 보스당 2종.
  | "v2_boss_mountain_axe"
  | "v2_boss_mountain_amulet"
  | "v2_boss_canyon_fang"
  | "v2_boss_canyon_boots"
  | "v2_boss_lake_maul"
  | "v2_boss_lake_gloves"
  // 마른 협곡 밴드 드랍 (깊이 7~12, T4) — 무기 4종 + 마른땅 갑주 세트.
  | "v2_canyon_greatsword"
  | "v2_canyon_staff"
  | "v2_canyon_bow"
  | "v2_canyon_dagger"
  | "v2_canyon_set_armor"
  | "v2_canyon_set_gloves"
  | "v2_canyon_set_boots"
  // 마른 협곡 추가 세트 — 바위문 수호구(중갑 탱커 3종) + 모래바람 장신구(반지·목걸이 2종).
  | "v2_canyon_sand_ring"
  | "v2_canyon_sand_necklace"
  // 얼음 호수 밴드 드랍 (밴드 B, 깊이 13~18, T5).
  | "v2_lake_greatsword"
  | "v2_lake_staff"
  | "v2_lake_bow"
  | "v2_lake_dagger"
  | "v2_lake_frost_armor"
  | "v2_lake_frost_gloves"
  | "v2_lake_frost_boots"
  | "v2_lake_chill_ring"
  | "v2_lake_chill_necklace"
  // 심층 동굴 밴드 드랍 (밴드 C, 깊이 19~24, T6).
  | "v2_cave_greatsword"
  | "v2_cave_staff"
  | "v2_cave_bow"
  | "v2_cave_dagger"
  | "v2_cave_abyss_armor"
  | "v2_cave_abyss_gloves"
  | "v2_cave_abyss_boots"
  | "v2_cave_void_ring"
  | "v2_cave_void_necklace"
  // 무기 포함 특화 세트 (밴드 드랍) — 맹독/마법/방어비례/금강.
  // 컨셉 사이드그레이드 (밴드 드랍) — 위력↔속도/무게/회피 트레이드, 슬롯 비전형.
  | "v2_canyon_swift_rapier"
  | "v2_canyon_wind_boots"
  | "v2_lake_brutal_greatsword"
  | "v2_lake_dodge_cloak"
  | "v2_cave_fortress_armor"
  | "v2_cave_rooted_boots"
  | "v2_cave_ruin_gloves"
  | "v2_cave_focus_ring"
  // 추가 2피스 세트 (밴드 드랍) — 장신구 외 부위·크로스 조합, 무기 비포함.
  // 잊힌 성소 밴드 드랍 (밴드 D, 깊이 25~30, T7).
  | "v2_sanctum_greatsword"
  | "v2_sanctum_staff"
  | "v2_sanctum_bow"
  | "v2_sanctum_dagger"
  | "v2_sanctum_set_armor"
  | "v2_sanctum_set_gloves"
  | "v2_sanctum_set_boots"
  | "v2_sanctum_arcana_ring"
  | "v2_sanctum_arcana_necklace"
  | "v2_sanctum_anchor_armor"
  | "v2_sanctum_nova_ring"
  // 리자드 늪지 밴드 드랍 (밴드 E, 깊이 31~36, T8).
  | "v2_swamp_greatsword"
  | "v2_swamp_staff"
  | "v2_swamp_bow"
  | "v2_swamp_dagger"
  | "v2_swamp_set_armor"
  | "v2_swamp_set_gloves"
  | "v2_swamp_set_boots"
  | "v2_swamp_heart_ring"
  | "v2_swamp_heart_necklace"
  | "v2_swamp_mire_boots"
  | "v2_swamp_bruiser_armor"
  // 짐승의 소굴 밴드 드랍 (밴드 F, 깊이 37~42, T9).
  | "v2_den_greatsword"
  | "v2_den_staff"
  | "v2_den_bow"
  | "v2_den_dagger"
  | "v2_den_set_armor"
  | "v2_den_set_gloves"
  | "v2_den_set_boots"
  | "v2_den_alpha_ring"
  | "v2_den_alpha_necklace"
  | "v2_den_mauler_gloves"
  | "v2_den_ghost_boots"
  | "v2_den_hide_armor"
  // 검은 왕도 밴드 드랍 (밴드 G, 깊이 43~48, T10) — 태그 세트(2/3단계) 첫 적용.
  | "v2_throne_greatsword"
  | "v2_throne_staff"
  | "v2_throne_bow"
  | "v2_throne_dagger"
  | "v2_throne_black_armor"
  | "v2_throne_void_robe"
  | "v2_throne_black_gloves"
  | "v2_throne_hunt_gloves"
  | "v2_throne_black_boots"
  | "v2_throne_shadow_boots"
  | "v2_throne_void_ring"
  | "v2_throne_royal_necklace"
  // 붉은 벌판 밴드 드랍 (밴드 H, 깊이 49~54, T11).
  | "v2_redfield_greatsword"
  | "v2_redfield_staff"
  | "v2_redfield_bow"
  | "v2_redfield_dagger"
  | "v2_redfield_war_armor"
  | "v2_redfield_ember_robe"
  | "v2_redfield_war_gloves"
  | "v2_redfield_spark_gloves"
  | "v2_redfield_war_boots"
  | "v2_redfield_ash_boots"
  | "v2_redfield_ember_ring"
  | "v2_redfield_banner_necklace"
  // 백골 고원 밴드 드랍 (밴드 I, 깊이 55~60, T12).
  | "v2_plateau_greatsword"
  | "v2_plateau_staff"
  | "v2_plateau_bow"
  | "v2_plateau_dagger"
  | "v2_plateau_bone_armor"
  | "v2_plateau_crow_robe"
  | "v2_plateau_bone_gloves"
  | "v2_plateau_slayer_gloves"
  | "v2_plateau_bone_boots"
  | "v2_plateau_rider_boots"
  | "v2_plateau_cairn_ring"
  | "v2_plateau_lord_necklace"
  // 고유 아이템(Signature Uniques) — 잊힌 성소(25)부터. docs/v2-signature-uniques-plan.md.
  | "v2_sanctum_sig_priest_armor"
  | "v2_sanctum_sig_priest_necklace"
  | "v2_sanctum_sig_spire_staff"
  | "v2_sanctum_sig_priest_boots"
  | "v2_sanctum_sig_sealed_ring"
  | "v2_swamp_sig_venom_gloves"
  | "v2_swamp_sig_slip_boots"
  | "v2_swamp_sig_scale_armor"
  | "v2_swamp_sig_fang_dagger"
  | "v2_swamp_sig_fang_necklace"
  | "v2_den_sig_alpha_greatsword"
  | "v2_den_sig_beasthide_armor"
  | "v2_den_sig_claw_gloves"
  | "v2_den_sig_tracker_boots"
  | "v2_den_sig_alpha_necklace"
  | "v2_throne_sig_eclipse_staff"
  | "v2_throne_sig_starfall_bow"
  | "v2_throne_sig_black_plate"
  | "v2_throne_sig_void_crown"
  | "v2_throne_sig_shadow_ring"
  | "v2_redfield_sig_ash_spear"
  | "v2_redfield_sig_powder_staff"
  | "v2_redfield_sig_redmane_cloak"
  | "v2_redfield_sig_storm_banner"
  | "v2_redfield_sig_ember_ring"
  | "v2_plateau_sig_skeleton_lance"
  | "v2_plateau_sig_crow_staff"
  | "v2_plateau_sig_bone_lord_plate"
  | "v2_plateau_sig_rider_boots"
  | "v2_plateau_sig_cairn_crown";

// 옵션 — 위력/무게 외 flavor 차별화 효과. derive 가 결과 player 에 후-가산.
//   crit, eva: 퍼센트 정수 (예: crit=2 → critChancePct +2)
//   mp, hp, spd: flat 정수
//   critMult: 백분의 일(×) 정수 — 100 = +1.0× 치명피해. derive 에서 /100 환산(예 30 → +0.30×).
//     (정수 저장 = 굴림 rollStat/표시 일관. 슬롯 고유 축 C: 반지=critMult, 신발=spd.)
export type V2EquipOptions = {
  /** critChancePct 후-가산, 퍼센트 정수. */
  crit?: number;
  /** evasionPct 후-가산, 퍼센트 정수 (EVASION_PCT_CAP 클램프 유지). */
  eva?: number;
  /** maxMp 후-가산, flat. */
  mp?: number;
  /** maxHp 후-가산, flat. */
  hp?: number;
  /** critMult 후-가산, 백분의 일 정수(100=+1.0×). derive 에서 /100. 반지 슬롯 고유 축. */
  critMult?: number;
  /** spd 후-가산, flat 정수. 신발 슬롯 고유 축. */
  spd?: number;
  /** 물리 방어력(def) 후-가산, flat 정수. 방어비례 스킬(기사) 특화 + 탱킹 공방일체 옵션
   *  (2026-06-08 신설). 갑옷 위력(def)과 같은 축 — aggregate 가 acc.def 에 더한다. */
  def?: number;
  /** 마법 방어력(magicDef) 후-가산, flat 정수. 장신구 위력 magicDef 와 같은 축 — aggregate 가
   *  acc.magicDef 에 더한다. 비장신구 슬롯도 마법방어를 줄 수 있게(마법탱·SPI 부활 PR-2). */
  magicDef?: number;
  /** 회복량 +%(healPowerPct) — derive healMult 에 패시브 회복강화와 합산해 곱연산. 지원 빌드
   *  itemize(SPI 부활 PR-2). 퍼센트(OPTION_PERCENT_KEYS). */
  healPowerPct?: number;
  /** 치명저항 +%p — 몬스터/PvP 치명 확률을 직접 차감. 세트 보너스 위주로 사용. */
  critResist?: number;
};

export const V2_EQUIP_OPTION_KEYS: readonly (keyof V2EquipOptions)[] = [
  "crit",
  "eva",
  "mp",
  "hp",
  "critMult",
  "spd",
  "def",
  "magicDef",
  "healPowerPct",
  "critResist",
];

export type V2Equipment = {
  id: V2EquipmentId;
  slot: V2EquipSlot;
  concept: V2EquipConcept;
  tier: V2EquipTier;
  name: string;
  description: string;
  /** 위력 — 슬롯별 분기(무기=weaponType 별 공격력 / 방어구=물방 / 장신구=마방). 항상 ≥ 1. */
  power: number;
  /** 무게 — 속도 −(선형, derive). 0 = 패널티 없음(장신구·경갑). */
  weight: number;
  /** flavor 옵션 — 위력/무게 외 부가 효과. 없으면 생략. */
  options?: V2EquipOptions;
  /** PR-5b 무기 속성 — 무기에 부여 시 평타/공격 속성을 이 속성으로(없으면 캐릭 속성).
   *  무기 슬롯만 의미 — 방어구·장신구의 element 는 무시. */
  element?: V2Element;
  /** 무기 종류 — 전문화 패시브 게이트(docs/v2-job-spec-passives-plan.md §4). 무기 슬롯만 의미.
   *  미지정 = 일반 무기(전문화 게이트 매칭 X). */
  weaponType?: V2WeaponType;
  /** 희귀도. 생략/"common" = 정규(상점·제작). "unique" = 드랍 전용(상점·제작·그리드 제외). */
  rarity?: V2EquipRarity;
  /** 제작 전용 — true 면 상점 비매품·정규 드랍 제외(레시피로만 획득). 분해는 가능. */
  craftOnly?: boolean;
  /** 전문화 스타터 — true 면 전직 지급 전용. 정규 그리드·상점·드랍 제외(craftOnly 와 동류 off-grid). */
  starterOnly?: boolean;
  /** 드랍 제외 — true 면 정규 드랍 풀에서 빠진다(상점·그리드는 유지). 전문화 무기=상점 전용,
   *  드랍은 후속 추가 예정. starterOnly/craftOnly 와 달리 상점 판매는 그대로. */
  noDrop?: boolean;
  /** 세트 id — 같은 세트 조각을 전부 장착하면 세트 보너스(V2_EQUIP_SETS). 없으면 세트 무관. */
  setId?: string;
  /** 태그 세트 — 같은 태그 아이템 N개 장착 시 단계 보너스(V2_EQUIP_TAG_SETS). */
  setTags?: readonly string[];
  /** Phase 2 — 단품 발동형 시그니처 효과(마퀴 단품만; 세트 시그니처는 V2EquipSet.signature). */
  signature?: SignatureEffect;
};

// 마을 상점 판매가 — T1~T3 는 스타터 곡선, T4+ 는 프론티어 밴드 장비 판매가.
// 부위별 곱: 무기 ×1.5, 갑옷 ×1.0, 장갑/신발 ×0.6, 반지/목걸이 ×0.5.
//   T1 base 300   → 무기 450 / 갑옷 300 / 장갑·신발 180 / 반지·목걸이 150
//   T3 base 388.8k → 무기 583.2k / 갑옷 388.8k / 장갑·신발 233.28k / 반지·목걸이 194.4k
// 2026-06-07 티어 1/3/5 → 1/2/3 리넘버(표기 숨김 후 연속번호). 곡선·매그니튜드는 불변(키만 리키).
// 2026-06-30 프론티어 드랍을 T4~T12로 재정립. 판매가는 T3 이후 ×2 완만 램프.
const SHOP_TIER_BASE: Record<V2EquipTier, number> = {
  1: 300,
  2: 10800,
  3: 388800,
  4: 777600,
  5: 1555200,
  6: 3110400,
  7: 6220800,
  8: 12441600,
  9: 24883200,
  10: 49766400,
  11: 99532800,
  12: 199065600,
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

// 상점 구매가 — **스타터(T1)만 판매**. 유니크·제작전용·전문화스타터는 비매품. T2/T3 는
//   드랍 전용(상점=처음 갖추는 구간만, 진짜 장비는 파밍). 판매가는 shopPriceForSell(티어 무관).
export function shopPriceOf(item: V2Equipment): number | undefined {
  if (item.rarity === "unique" || item.craftOnly || item.starterOnly)
    return undefined;
  if (item.tier !== 1) return undefined; // 상점 구매는 스타터 티어(T1)만
  return shopPriceFor(item.tier, item.slot);
}

// 판매가 산정용 — 구매 가능(상점 비치) 여부와 무관. 드랍으로 얻은 T2/T3 도 팔 수 있어야 하므로
//   티어 게이트 없이 (티어, 슬롯) 곡선. **전 장비 판매 가능**(2026-06-07 사용자 결정): 유니크·제작
//   전용·전문화 스타터(수련용)도 판매 허용 — 인벤 클러터(전직 지급 수련용 등) 정리. 실수 판매는
//   잠금(locked)으로 방지. 구매(shopPriceOf)는 여전히 스타터 T1만(유니크 등 비매=구매 불가 유지).
export function shopPriceForSell(item: V2Equipment): number | undefined {
  return shopPriceFor(item.tier, item.slot);
}

// 판매가 비율 — 구매가의 5%(floor). 단건/일괄 판매 공용 단일 소스(드리프트 방지).
export const SELL_PRICE_RATIO = 0.05;

// 개체 1개 판매가 — 비매품(유니크 등)이면 null.
export function sellPriceOf(item: V2Equipment): number | null {
  const base = shopPriceForSell(item);
  if (base == null) return null;
  return Math.max(1, Math.floor(base * SELL_PRICE_RATIO));
}

// 유니크 여부 — 상점/제작/그리드 제외 판정에 공용.
export function isUnique(item: V2Equipment): boolean {
  return item.rarity === "unique";
}

// ── 전문화 무기 게이트 (docs/v2-job-spec-passives-plan.md §4) ──────────────────
// 직업 전문화 패시브가 "특정 무기 종류 착용 시에만" 발동(완전 비활성 폴백). derive 가 장착 무기의
// 종류를 이 헬퍼로 판정해 전문화 패시브 적용 여부를 가른다. 순수 함수(데이터 조회) — P1 토대.

/** 장착 무기(카탈로그 id)의 종류. 미장착/일반 무기(타입 없음)면 undefined. */
export function weaponTypeOf(
  weaponId: V2EquipmentId | undefined | null,
): V2WeaponType | undefined {
  if (!weaponId) return undefined;
  return V2_EQUIPMENT[weaponId]?.weaponType;
}

/** 전문화 무기 게이트 — 장착 무기가 요구 종류와 일치하는지. required 없으면 게이트 없음(항상 통과). */
export function weaponGateOpen(
  weaponId: V2EquipmentId | undefined | null,
  required: V2WeaponType | undefined,
): boolean {
  if (!required) return true;
  return weaponTypeOf(weaponId) === required;
}

// === 발동형 시그니처 효과 (Phase 2) ==================================
// 고유 아이템(세트 완성 또는 단품)이 전투 "중"에 조건부로 발동하는 효과. 옵션(flat 패시브)과 달리
//   트리거가 있다(저체력/회피/크리/N타마다). docs/v2-signature-uniques-plan.md §10.
//   🔑 라이브 사냥=단일 적 1v1 → on-kill 무용(처치=전투 종료) → 전투 중 트리거만.
//   엔진(engine.playerPhase/enemyPhase/pvpPhase)이 PlayerCombat.equipSignatures 로 읽어 발동.
//   미장착(undefined)=엔진 훅 미발화 → 골든 byte-identical.
export type SignatureTrigger = "low_hp" | "on_dodge" | "on_crit" | "every_n_hits";
export type SignatureEffect = {
  trigger: SignatureTrigger;
  /** 전투로그/UI 표기 이름(예: "성물"). */
  label: string;
  /** low_hp: 현재 HP 가 maxHp 의 이 % 이하일 때 효과 활성. */
  hpThresholdPct?: number;
  /** low_hp: 받는 피해 −% (조건 충족 시). */
  damageTakenReductionPct?: number;
  /** on_dodge/on_crit: 발동 시 속도 +% 버프. */
  spdBuffPct?: number;
  /** 속도/스탯 버프 지속(행동 수). */
  buffActions?: number;
  /** on_dodge/on_crit: 발동 시 maxHp 의 이 % 만큼 회복. */
  healPct?: number;
  /** on_crit: 크리 시 대상에게 중독(독 DoT) 부여. */
  poisonOnCrit?: boolean;
  /** on_crit: 크리 시 대상에게 한기(둔화) — 적 속도 −% (buffActions 행동). 군림(자속도+)의 거울. */
  chillSlowPct?: number;
  /** every_n_hits: 이 횟수마다 1회 추가타. */
  everyNHits?: number;
};

// 시그니처 효과 → 사람이 읽는 한 줄(아이템/세트 툴팁용). 트리거+파라미터를 한국어로.
export function signatureLabel(sig: SignatureEffect): string {
  switch (sig.trigger) {
    case "low_hp":
      return `체력 ${sig.hpThresholdPct ?? 0}% 이하일 때 받는 피해 −${sig.damageTakenReductionPct ?? 0}%`;
    case "on_dodge":
      if (sig.healPct) return `회피 시 HP +${sig.healPct}% 회복`;
      if (sig.spdBuffPct)
        return `회피 시 속도 +${sig.spdBuffPct}% (${sig.buffActions ?? 1}행동)`;
      return "회피 시 발동";
    case "on_crit":
      if (sig.poisonOnCrit) return "치명타 시 대상 중독(독)";
      if (sig.chillSlowPct)
        return `치명타 시 대상 한기 — 속도 −${sig.chillSlowPct}% (${sig.buffActions ?? 1}행동)`;
      if (sig.spdBuffPct)
        return `치명타 시 속도 +${sig.spdBuffPct}% (${sig.buffActions ?? 1}행동)`;
      return "치명타 시 발동";
    case "every_n_hits":
      return `${sig.everyNHits ?? 0}타마다 추가타 1회`;
  }
}

// === 장비 세트 ======================================================
// 한 세트의 조각을 전부 장착하면 보너스(옵션 후-가산, aggregateV2Equipment 에서 적용).
export type V2EquipSet = {
  id: string;
  name: string;
  pieces: readonly V2EquipmentId[];
  /** 전 조각 장착 시 후-가산 보너스. V2EquipOptions 형태(crit/eva/mp/hp) 재사용. */
  bonus: Readonly<V2EquipOptions>;
  /** Phase 2 — 세트 완성 시 발동하는 시그니처 효과(없으면 스탯 보너스만). */
  signature?: SignatureEffect;
};

export type V2EquipTagSet = {
  id: string;
  name: string;
  thresholds: readonly {
    count: number;
    bonus: Readonly<V2EquipOptions>;
    signature?: SignatureEffect;
  }[];
};

export const V2_EQUIP_SETS: readonly V2EquipSet[] = [
  {
    // 마른 협곡 밴드 드랍 세트(갑주 3종). 드랍 전용 유니크. 3종 다 착용 시 치명·치명피해·HP.
    id: "dry_canyon",
    name: "마른땅 갑주",
    pieces: [
      "v2_canyon_set_armor",
      "v2_canyon_set_gloves",
      "v2_canyon_set_boots",
    ],
    bonus: { crit: 5, critMult: 30, hp: 30 },
  },
  {
    // 마른 협곡 장신구 세트(반지+목걸이 2종). 갑주와 동시 착용 가능 — 버스트 유틸. 2종 보너스 치명+8·속도+6.
    id: "canyon_sandstorm",
    name: "모래바람 장신구",
    pieces: ["v2_canyon_sand_ring", "v2_canyon_sand_necklace"],
    bonus: { crit: 8, spd: 6 },
  },
  {
    // 얼음 호수 공격형 세트(갑주 3종). 빙벽 수호구와 슬롯 택일. 3종 보너스 치명+5·속도+6·HP+40 (속공 크리 결).
    id: "frost_plate",
    name: "서리 갑주",
    pieces: [
      "v2_lake_frost_armor",
      "v2_lake_frost_gloves",
      "v2_lake_frost_boots",
    ],
    bonus: { crit: 5, spd: 6, hp: 40 },
  },
  {
    // 얼음 호수 장신구 세트(반지+목걸이 2종). 갑주와 동시 착용 가능 — 회피/지속 유틸. 2종 보너스 회피+6·HP+60.
    id: "chill_charm",
    name: "한기 장신구",
    pieces: ["v2_lake_chill_ring", "v2_lake_chill_necklace"],
    bonus: { eva: 6, hp: 60 },
  },
  {
    // 심층 동굴 공격형 세트(갑주 3종). 흑요 수호구와 슬롯 택일. 3종 보너스 치명피해+0.5×·MP+40·HP+50 (크리+캐스터 결).
    id: "abyss_plate",
    name: "심연 갑주",
    pieces: [
      "v2_cave_abyss_armor",
      "v2_cave_abyss_gloves",
      "v2_cave_abyss_boots",
    ],
    bonus: { critMult: 50, mp: 40, hp: 50 },
  },
  {
    // 심층 동굴 장신구 세트(반지+목걸이 2종). 갑주와 동시 착용 가능 — 마력/엔진 유틸. 2종 보너스 MP+50·속도+6.
    id: "void_charm",
    name: "공허 장신구",
    pieces: ["v2_cave_void_ring", "v2_cave_void_necklace"],
    bonus: { mp: 50, spd: 6 },
  },

  // ── 무기 포함 특화 세트 ──────────────────────────────────────────────────────
  // ── 추가 2피스 세트 (무기 비포함, 밴드 드랍) — 6슬롯 자유 세팅용. 장신구 외 부위·크로스 조합.
  //    3피스보다 약하게(작은 세트 둘 + 단일 혼합 전제). 라이브/sim 재캘리브 여지.
  {
    id: "starlight_plate",
    name: "별무리 갑주",
    pieces: [
      "v2_sanctum_set_armor",
      "v2_sanctum_set_gloves",
      "v2_sanctum_set_boots",
    ],
    bonus: { critMult: 70, mp: 55, hp: 70 },
  },
  {
    id: "sanctum_arcana",
    name: "성운 장신구",
    pieces: ["v2_sanctum_arcana_ring", "v2_sanctum_arcana_necklace"],
    bonus: { mp: 70, spd: 8 },
  },
  {
    id: "swamp_mist",
    name: "독안개 갑주",
    pieces: [
      "v2_swamp_set_armor",
      "v2_swamp_set_gloves",
      "v2_swamp_set_boots",
    ],
    bonus: { spd: 10, eva: 7, hp: 80 },
  },
  {
    id: "swamp_heart",
    name: "늪심장 장신구",
    pieces: ["v2_swamp_heart_ring", "v2_swamp_heart_necklace"],
    bonus: { hp: 100, eva: 10 },
  },
  {
    id: "den_predator",
    name: "포식자 갑주",
    pieces: [
      "v2_den_set_armor",
      "v2_den_set_gloves",
      "v2_den_set_boots",
    ],
    bonus: { critMult: 100, mp: 80, hp: 100 },
  },
  {
    id: "den_alpha",
    name: "우두머리 장신구",
    pieces: ["v2_den_alpha_ring", "v2_den_alpha_necklace"],
    bonus: { mp: 100, spd: 12 },
  },

  // ── 고유 아이템(Signature) 2피스 세트 — 일부만 세트, 일부는 단품(다양성). 보수적 2피스 보너스.
  {
    id: "sig_relic",
    name: "성물",
    pieces: ["v2_sanctum_sig_priest_armor", "v2_sanctum_sig_priest_necklace"],
    bonus: { healPowerPct: 8, magicDef: 12 },
    // 저체력(HP≤30%) 시 받는 피해 −25% — 버팀 정체성(Phase 2).
    signature: {
      trigger: "low_hp",
      label: "성물",
      hpThresholdPct: 30,
      damageTakenReductionPct: 25,
    },
  },
  {
    id: "sig_venomlord",
    name: "독왕",
    pieces: ["v2_swamp_sig_venom_gloves", "v2_swamp_sig_slip_boots"],
    bonus: { eva: 6, crit: 6 },
    // 회피 성공 시 3행동 동안 속도 +25% — 기동 정체성(Phase 2).
    signature: {
      trigger: "on_dodge",
      label: "독왕",
      spdBuffPct: 25,
      buffActions: 3,
    },
  },
  {
    id: "sig_predator",
    name: "포식자",
    pieces: ["v2_den_sig_alpha_greatsword", "v2_den_sig_beasthide_armor"],
    bonus: { critMult: 40, hp: 60 },
    // 3타마다 추가타 1회 — 폭딜 정체성(Phase 2).
    signature: { trigger: "every_n_hits", label: "포식자", everyNHits: 3 },
  },
  {
    id: "sig_black_throne",
    name: "검은 왕좌",
    pieces: ["v2_throne_sig_black_plate", "v2_throne_sig_void_crown"],
    bonus: { hp: 180, magicDef: 18, critResist: 8 },
    signature: {
      trigger: "low_hp",
      label: "검은 왕좌",
      hpThresholdPct: 35,
      damageTakenReductionPct: 20,
    },
  },
];

export const V2_EQUIP_TAG_SETS: readonly V2EquipTagSet[] = [
  {
    id: "artisan_crafted",
    name: "장인표 장비",
    thresholds: [
      { count: 2, bonus: { hp: 50, mp: 30 } },
      { count: 4, bonus: { crit: 3, eva: 3, critResist: 3 } },
      {
        count: 6,
        bonus: {
          hp: 180,
          mp: 120,
          crit: 6,
          eva: 6,
          spd: 9,
          critMult: 24,
          healPowerPct: 4,
        },
      },
    ],
  },
  {
    id: "black_iron",
    name: "흑철",
    thresholds: [
      { count: 2, bonus: { hp: 100, magicDef: 10 } },
      { count: 3, bonus: { hp: 160, magicDef: 18, critResist: 8 } },
    ],
  },
  {
    id: "void_regalia",
    name: "공허 예복",
    thresholds: [
      { count: 2, bonus: { mp: 120, magicDef: 8 } },
      { count: 3, bonus: { mp: 180, magicDef: 14, spd: 8 } },
    ],
  },
  {
    id: "royal_hunt",
    name: "왕도 사냥꾼",
    thresholds: [
      { count: 2, bonus: { crit: 6, spd: 6 } },
      { count: 3, bonus: { crit: 10, eva: 6, spd: 10 } },
    ],
  },
  {
    id: "ash_line",
    name: "잿빛 전선",
    thresholds: [
      { count: 2, bonus: { hp: 140, def: 18, critResist: 4 } },
      { count: 3, bonus: { hp: 220, def: 32, magicDef: 12, critResist: 8 } },
    ],
  },
  {
    id: "ember_rite",
    name: "연소 의식",
    thresholds: [
      { count: 2, bonus: { mp: 150, healPowerPct: 5, magicDef: 12 } },
      { count: 3, bonus: { mp: 230, healPowerPct: 10, magicDef: 20, critResist: 4 } },
    ],
  },
  {
    id: "storm_hunt",
    name: "폭풍 추격",
    thresholds: [
      { count: 2, bonus: { crit: 5, eva: 5, spd: 8 } },
      { count: 3, bonus: { crit: 9, eva: 10, critMult: 35, spd: 14 } },
    ],
  },
  {
    id: "bone_line",
    name: "백골 장벽",
    thresholds: [
      { count: 2, bonus: { hp: 180, def: 26, critResist: 7 } },
      { count: 3, bonus: { hp: 320, def: 48, magicDef: 18, critResist: 12 } },
    ],
  },
  {
    id: "crow_rite",
    name: "까마귀 조문",
    thresholds: [
      { count: 2, bonus: { mp: 170, healPowerPct: 5, magicDef: 16 } },
      { count: 3, bonus: { mp: 260, healPowerPct: 10, magicDef: 28, critResist: 5 } },
    ],
  },
  {
    id: "death_hunt",
    name: "사혼 추격",
    thresholds: [
      { count: 2, bonus: { crit: 7, critMult: 35, spd: 7 } },
      { count: 3, bonus: { crit: 11, eva: 9, critMult: 60, spd: 12 } },
    ],
  },
];

// 슬롯별 catalog id 모음 — UI 가 슬롯 탭 표시할 때 사용.
export function v2EquipmentBySlot(slot: V2EquipSlot): V2Equipment[] {
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[])
    .map((id) => V2_EQUIPMENT[id])
    .filter((e) => e.slot === slot);
}

// 컨셉별 catalog — 같은 컨셉의 T1~T3 가 줄 서 나옴.
export function v2EquipmentByConcept(concept: V2EquipConcept): V2Equipment[] {
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[])
    .map((id) => V2_EQUIPMENT[id])
    .filter((e) => e.concept === concept)
    .sort((a, b) => a.tier - b.tier);
}

// 슬롯별로 그 슬롯의 컨셉 모음. UI 그룹화에 사용.
export const SLOT_CONCEPTS: Record<V2EquipSlot, V2EquipConcept[]> = {
  weapon: ["str", "dex", "int"],
  armor: ["heavy", "light"], // 중갑(방어탱)/경갑(회피) — 실효 트레이드오프라 유지
  gloves: ["light"], // 중갑 폐기(경갑과 스탯 동일·무게만 더한 열티어)
  boots: ["light"], // 중갑 폐기(동상)
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

// 무기 종류 한글 라벨 — V2WeaponType 표시용(아이템 종류 칩 등).
export const WEAPON_TYPE_LABELS: Record<V2WeaponType, string> = {
  greatsword: "대검",
  staff: "지팡이",
  bow: "활",
  dagger: "단검",
};

// 슬롯 한글 라벨 — 여러 뷰가 인라인으로 중복하던 것을 단일 출처로.
export const V2_SLOT_LABEL: Record<V2EquipSlot, string> = {
  weapon: "무기",
  armor: "갑옷",
  gloves: "장갑",
  boots: "신발",
  ring: "반지",
  necklace: "목걸이",
};

// 아이템 "종류" 표시 라벨 — 무기는 무기 종류(세검/대검/활 등), 그 외 슬롯은 부위명(갑옷/장갑 등).
//   종류 미지정 일반 무기는 "무기"로 폴백.
export function v2ItemTypeLabel(item: V2Equipment): string {
  if (item.slot === "weapon") {
    return (
      (item.weaponType && WEAPON_TYPE_LABELS[item.weaponType]) ||
      V2_SLOT_LABEL.weapon
    );
  }
  return V2_SLOT_LABEL[item.slot];
}

const OPTION_LABELS: Record<keyof V2EquipOptions, string> = {
  crit: "치명",
  eva: "회피",
  mp: "MP",
  hp: "HP",
  critMult: "치명피해",
  spd: "속도",
  def: "방어",
  magicDef: "마법방어",
  healPowerPct: "회복",
  critResist: "치명저항",
};

// 단위가 % 인 옵션 키 — UI 표시 시 "+2%" 처럼 후행 % 붙임.
const OPTION_PERCENT_KEYS: ReadonlySet<keyof V2EquipOptions> = new Set<
  keyof V2EquipOptions
>(["crit", "eva", "healPowerPct", "critResist"]);

// 장비 옵션 한 줄 — 라벨과 값(부호·단위 포함)을 분리해 들고 있다.
// 카드가 라벨(좌)·값(우) 행으로 그리려면 합친 문자열이 아니라 이 형태가 필요.
export type V2EquipStatRow = { label: string; value: string };

export function v2EquipPowerLabel(item: V2Equipment): string {
  if (item.slot === "weapon") {
    return item.weaponType === "staff" ? "마법 공격력" : "공격력";
  }
  if (item.slot === "ring" || item.slot === "necklace") return "마법 방어력";
  return "방어력";
}

// 무게 표시·체감 스케일 — 카탈로그 원시 무게가 SPD(다중공격·템포) 가치에 비해 너무 작아
//   "옵션이 있긴 한가" 싶을 만큼 미미했다(오너 피드백). 원시 무게를 슬롯별 계수로 키운다:
//   일반 장비 ×2, 무기는 원시 무게가 과하게 가벼워 ×4(별도·더 무겁게). 속도 페널티는 그대로
//   무게×WEIGHT_SPD_PENALTY 라 "표시 무게 1 = 속도 −2" 직관이 유지된다(체감만 비례 확대).
//   카탈로그 값·굴림은 불변 — 단일 다이얼(per-item churn·기존 보유템 불일치 회피). effectiveStats
//   상류에서 키우므로 신규/기존(굴림) 아이템이 동일하게 적용된다. 무게는 전투력 점수에 미산입이라
//   순수 속도 트레이드오프(파워 인플레 없음).
export const EQUIP_WEIGHT_SCALE = 2;
export const WEAPON_WEIGHT_SCALE = 4;
export function scaledEquipWeight(item: V2Equipment, rawWeight: number): number {
  return (
    rawWeight * (item.slot === "weapon" ? WEAPON_WEIGHT_SCALE : EQUIP_WEIGHT_SCALE)
  );
}

// 적용 스탯 — 개체 굴림(V2EquipRoll) 있으면 그 값, 없으면 카탈로그(상점 구매·옛 데이터·옵션
// 없는 아이템). 옵션은 **카탈로그 키로 스코프 + per-key 병합** — 카탈로그에 없는 옵션은
// (손상/변조 세이브라도) 주입 안 하고, 카탈로그 옵션이 굴림에서 누락돼도 떨어뜨리지 않음.
// 무게는 scaledEquipWeight 로 키워 반환(표시·derive 공통) — 카탈로그/굴림 원시값은 불변.
// derive·표시·UI 공용 단일 source (V2EquipRoll 타입은 아래에 선언, 타입 호이스팅으로 참조 가능).
export function effectiveStats(
  item: V2Equipment,
  roll: V2EquipRoll | undefined,
): { power: number; weight: number; options?: V2EquipOptions } {
  if (!roll) {
    return {
      power: item.power,
      weight: scaledEquipWeight(item, item.weight),
      options: item.options,
    };
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
  return {
    power: roll.power,
    weight: scaledEquipWeight(item, roll.weight),
    options,
  };
}

// ── 위력 색 분류 (등급/희귀도 대신) ──────────────────────────────────────────
// 사용자 결정(2026-06-08): 아이템을 티어/유니크 등급이 아니라 "절대 위력"으로 색 분류.
//   **표시되는(실효) 위력 기준** — 굴림으로 오른 개체는 그 굴림 위력으로 색 결정(색이 표시 위력과
//   일치). "품질 무관"=품질 %(정규화 위치)는 색에 안 쓴다는 뜻이지, 굴림 위력 자체를 무시하는 건
//   아니다(예: 기본 110 서리방패 검이 166 으로 굴리면 옅은보라가 아니라 보라).
//   위력 step 마다 색이 한 단계 오른다. 부위마다 위력 스케일이 크게 달라(무기 6~170 · 장신구 2~11)
//   step 도 부위별로 다르다(사용자: "무기는 75 단위"). 색 매핑은 UI(powerNameClass).
const SLOT_POWER_STEP: Record<V2EquipSlot, number> = {
  weapon: 75,
  armor: 25,
  gloves: 7,
  boots: 7,
  ring: 5,
  necklace: 5,
};

// 위력 색 구간 수 — 0(낮음) … POWER_BAND_COUNT-1(최상). 8단계(회색→에메랄드→약간푸른빛→보라
//   →노랑→자홍→장미→진홍). 현재 위력대는 0~2 사용, 3~7 은 향후 고위력 콘텐츠 여유분. step·구간수는 다이얼.
export const POWER_BAND_COUNT = 8;

// 위력 → 색 구간(0…6). 실효 위력(굴림 반영) ÷ 부위 step(내림), 상한 클램프. roll 없으면 카탈로그 위력.
export function powerBandOf(item: V2Equipment, roll?: V2EquipRoll): number {
  const step = SLOT_POWER_STEP[item.slot] ?? 1;
  const power = effectiveStats(item, roll).power;
  return Math.max(
    0,
    Math.min(POWER_BAND_COUNT - 1, Math.floor(power / step)),
  );
}

// 장비 → {라벨, 값} 행 배열. 기본 전투 스탯 → 무게 → 옵션 순. 0 값은 건너뜀.
// roll 주면 개체 굴림값 표시(보유템), 없으면 카탈로그(상점·제작 미리보기). 단일 source.
export function v2EquipStatRows(
  item: V2Equipment,
  roll?: V2EquipRoll,
  // 강화 — 위력 행에 반영(enhancedPower). 강화 수치 자체는 이름 옆 "+N" 으로 표기(별도 행 없음).
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
): V2EquipStatRow[] {
  const eff = effectiveStats(item, roll);
  const out: V2EquipStatRow[] = [];
  const power = powerWithBonuses(eff.power, enhance, craftQuality);
  if (power) {
    out.push({ label: v2EquipPowerLabel(item), value: `+${power}` });
  }
  if (eff.weight) {
    out.push({ label: "무게", value: `${eff.weight}` });
  }
  const opts = eff.options ?? {};
  for (const k of V2_EQUIP_OPTION_KEYS) {
    const v = opts[k];
    if (!v) continue;
    // critMult 는 백분의 일 정수 저장(30 = +0.30×) → 배수 표기. 그 외 %/flat.
    const value =
      k === "critMult"
        ? `+${(v / 100).toFixed(2)}×`
        : `+${v}${OPTION_PERCENT_KEYS.has(k) ? "%" : ""}`;
    out.push({ label: OPTION_LABELS[k], value });
  }
  return out;
}

// 표시 문자열 배열 ("공격력 +14", "무게 2", "치명 +2%" 등) — 한 줄 인라인용.
// rows 를 합쳐 단일 source 유지.
export function v2EquipStatEntries(item: V2Equipment, roll?: V2EquipRoll): string[] {
  return v2EquipStatRows(item, roll).map((r) => `${r.label} ${r.value}`);
}

// ── 장비 비교(장착 중 vs 후보) ───────────────────────────────────────────────
// 인벤토리에서 미장착 장비를 탭하면 그 슬롯의 장착 장비와 한 화면에서 비교한다.
// 후보의 각 스탯에 "현재 대비 증감"을 붙여 이득/손해를 색으로 즉시 인지하게 한다.

export type V2EquipCompareRow = {
  label: string;
  /** 후보 표시값(없으면 "—") — v2EquipStatRows 와 동일 포맷. */
  value: string;
  /** 증감 표시("" = 동일). 무게만 감소가 이득이라 부호는 그대로, 색은 better 로 결정. */
  deltaText: string;
  /** 1 = 이득(초록) · -1 = 손해(빨강) · 0 = 동일. 무게는 낮을수록 이득(lowerBetter). */
  better: 0 | 1 | -1;
};

// 비교 행 순서 + 무게만 "낮을수록 이득" — 전투 스탯/옵션은 높을수록 이득.
const COMPARE_FIELD_ORDER: { label: string; lowerBetter: boolean }[] = [
  { label: "공격력", lowerBetter: false },
  { label: "마법 공격력", lowerBetter: false },
  { label: "방어력", lowerBetter: false },
  { label: "마법 방어력", lowerBetter: false },
  { label: "무게", lowerBetter: true },
  ...V2_EQUIP_OPTION_KEYS.map((k) => ({
    label: OPTION_LABELS[k],
    lowerBetter: false,
  })),
];

// 라벨별 수치(증감 계산용) — effectiveStats 의 기본 전투 스탯(강화 반영)·무게·옵션을 평탄화.
function compareNumeric(
  item: V2Equipment,
  roll?: V2EquipRoll,
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
): Record<string, number> {
  const eff = effectiveStats(item, roll);
  const out: Record<string, number> = {
    [v2EquipPowerLabel(item)]: powerWithBonuses(eff.power, enhance, craftQuality),
    무게: eff.weight,
  };
  const opts = eff.options ?? {};
  for (const k of V2_EQUIP_OPTION_KEYS) out[OPTION_LABELS[k]] = opts[k] ?? 0;
  return out;
}

// 증감 표시 — v2EquipStatRows 와 단위 일치(치명피해 ×, 치명/회피/회복 %, 그 외 flat).
function formatCompareDelta(label: string, delta: number): string {
  const sign = delta > 0 ? "+" : "-";
  const a = Math.abs(delta);
  if (label === OPTION_LABELS.critMult) return `${sign}${(a / 100).toFixed(2)}×`;
  if (
    label === OPTION_LABELS.crit ||
    label === OPTION_LABELS.eva ||
    label === OPTION_LABELS.healPowerPct
  ) {
    return `${sign}${a}%`;
  }
  return `${sign}${a}`;
}

// 후보 vs 장착 중 — 라벨별 후보값 + 증감/이득방향. 어느 한쪽이라도 값이 있으면 행을 만든다
//   (후보엔 없고 장착엔 있는 스탯도 "—" + 손해로 노출 → 다운그레이드 가시화).
export function v2EquipCompareRows(
  candidate: {
    item: V2Equipment;
    roll?: V2EquipRoll;
    enhance?: V2EnhanceState;
    craftQuality?: V2CraftQualityState;
  },
  equipped: {
    item: V2Equipment;
    roll?: V2EquipRoll;
    enhance?: V2EnhanceState;
    craftQuality?: V2CraftQualityState;
  },
): V2EquipCompareRow[] {
  const candDisplay = new Map(
    v2EquipStatRows(
      candidate.item,
      candidate.roll,
      candidate.enhance,
      candidate.craftQuality,
    ).map((r) => [r.label, r.value] as const),
  );
  const candN = compareNumeric(
    candidate.item,
    candidate.roll,
    candidate.enhance,
    candidate.craftQuality,
  );
  const eqN = compareNumeric(
    equipped.item,
    equipped.roll,
    equipped.enhance,
    equipped.craftQuality,
  );
  const out: V2EquipCompareRow[] = [];
  for (const { label, lowerBetter } of COMPARE_FIELD_ORDER) {
    const cv = candN[label] ?? 0;
    const ev = eqN[label] ?? 0;
    if (cv === 0 && ev === 0) continue;
    const delta = cv - ev;
    const better: 0 | 1 | -1 =
      delta === 0 ? 0 : lowerBetter ? (delta < 0 ? 1 : -1) : delta > 0 ? 1 : -1;
    out.push({
      label,
      value: candDisplay.get(label) ?? "—",
      deltaText: delta === 0 ? "" : formatCompareDelta(label, delta),
      better,
    });
  }
  return out;
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
};

export type V2CraftedBy = {
  userId: string;
  name?: string;
  profession: "blacksmith";
  level: number;
  craftedAt: string;
  /** 명장 제작 모드로 생산된 제작품 표식. 납품·거래 가치 판정에 사용한다. */
  masterwork?: boolean;
};

export type V2CraftQualityLevel = 1 | 2;
export type V2CraftQualityState = {
  level: V2CraftQualityLevel;
  /** 제작 품질 위력 보너스 %p. 강화와 별도 축이며 UI 에서는 별로 표시한다. */
  bonusPct: number;
};

export const CRAFT_QUALITY_BONUS_PCT: Record<V2CraftQualityLevel, number> = {
  1: 5,
  2: 10,
};

export function craftQualityBonusPct(level: number): number {
  return level >= 2 ? CRAFT_QUALITY_BONUS_PCT[2] : CRAFT_QUALITY_BONUS_PCT[1];
}

export function parseCraftQuality(raw: unknown): V2CraftQualityState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const level = Math.floor(Number((raw as Record<string, unknown>).level));
  if (level !== 1 && level !== 2) return undefined;
  return { level, bonusPct: craftQualityBonusPct(level) };
}

export function craftQualityStars(
  craftQuality: V2CraftQualityState | undefined,
): string {
  return craftQuality ? "★".repeat(craftQuality.level) : "";
}

export function powerWithBonuses(
  basePower: number,
  enhance?: V2EnhanceState,
  craftQuality?: V2CraftQualityState,
): number {
  const bonusPct = (enhance?.bonusPct ?? 0) + (craftQuality?.bonusPct ?? 0);
  if (bonusPct <= 0) return basePower;
  return Math.floor(basePower * (1 + bonusPct / 100));
}

// 장비 개체(instance) — 같은 카탈로그 id 라도 개별 굴림을 갖는 한 자루. iid 로 식별.
//   iid: 고유 식별자(획득 시 생성, 재사용 금지) · id: 카탈로그 id · roll: 개체 굴림(없으면 카탈로그값).
//   locked: 즐겨찾기 잠금 — 일괄/실수 판매 방지. true 만 저장(false/없음 = 미잠금).
export type V2EquipInstance = {
  iid: string;
  id: V2EquipmentId;
  roll?: V2EquipRoll;
  locked?: boolean;
  /** 강화 상태(+레벨·누적 위력 보너스 %p) — 미강화는 부재. v2Enhance 참고. */
  enhance?: V2EnhanceState;
  /** 제작 품질(★/★★) — 강화와 별도 표시·보너스 축. */
  craftQuality?: V2CraftQualityState;
  /** 제작자 표식 — 길드 대장간 제작품에만 붙는 표시용 메타. */
  craftedBy?: V2CraftedBy;
};

// 개체 iid 생성 — 서버/클라 공용. crypto.randomUUID 우선, 없으면 폴백.
export function genEquipIid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `eq_${c.randomUUID()}`;
  return `eq_${Date.now().toString(36)}_${Math.floor(
    Math.random() * 1e9,
  ).toString(36)}`;
}

// 전문화 전직 지급용 스타터 무기 — weaponType → 무기 id. 통합 후 쓰는 8종만 매핑
// (tonfa/spellblade/relic/needle 은 통합돼 미사용 → undefined: 지급 skip). 대검은 기존 v2_greatsword 재사용.
export function starterWeaponForType(
  type: V2WeaponType,
): V2EquipmentId | undefined {
  switch (type) {
    case "greatsword":
      return "v2_greatsword";
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
// 거래소 buy/cancel 의 payload 복원에도 쓰여 공개(굴림 방어 파스 단일 출처).
export function parseEquipRoll(val: unknown): V2EquipRoll | undefined {
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

export function parseCraftedBy(val: unknown): V2CraftedBy | undefined {
  if (!val || typeof val !== "object" || Array.isArray(val)) return undefined;
  const raw = val as Record<string, unknown>;
  if (typeof raw.userId !== "string" || raw.userId.length <= 0) {
    return undefined;
  }
  if (raw.profession !== "blacksmith") return undefined;
  const level = Math.max(1, Math.floor(Number(raw.level) || 1));
  const craftedAt =
    typeof raw.craftedAt === "string" && Number.isFinite(Date.parse(raw.craftedAt))
      ? raw.craftedAt
      : new Date(0).toISOString();
  const name =
    typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : undefined;
  return {
    userId: raw.userId,
    ...(name ? { name } : {}),
    profession: "blacksmith",
    level,
    craftedAt,
    ...(raw.masterwork === true ? { masterwork: true } : {}),
  };
}

function parseLegacyCraftQuality(
  val: unknown,
  craftedBy: V2CraftedBy | undefined,
): V2CraftQualityState | undefined {
  if (!craftedBy || !val || typeof val !== "object" || Array.isArray(val)) {
    return undefined;
  }
  const raw = val as Record<string, unknown>;
  const level = Math.floor(Number(raw.level));
  const bonusPct = Math.floor(Number(raw.bonusPct));
  if (
    Number.isFinite(level) &&
    Number.isFinite(bonusPct) &&
    (level === 1 || level === 2) &&
    bonusPct === CRAFT_QUALITY_BONUS_PCT[level]
  ) {
    return { level, bonusPct };
  }
  return undefined;
}

export function parseInstanceCraftQuality(
  craftQuality: unknown,
  legacyEnhance: unknown,
  craftedBy: V2CraftedBy | undefined,
): V2CraftQualityState | undefined {
  return parseCraftQuality(craftQuality) ?? parseLegacyCraftQuality(legacyEnhance, craftedBy);
}

// equipment.v2 파싱 — 개체(instance) 모델. owned = {iid,id,roll?,locked?,enhance?} 배열.
// 카탈로그 슬롯(item.slot) 기준 배치(저장 슬롯 키 불신). equipped = 슬롯→iid. 옛 24-class·티어
// 리매핑(LEGACY_ID_REMAP)·옛 {owned:id[], statRolls} 마이그는 폐지(DB 초기화 전제) — 알 수 없는
// id 는 무음 제거. 누락/중복 iid 는 결정적 스킴(`id~n`)으로 복구해 read=write 안정성을 유지한다.
export function parseEquipmentSave(raw: unknown): {
  owned: V2EquipInstance[];
  equipped: Partial<Record<V2EquipSlot, string>>;
} {
  const v = (raw ?? {}) as EquipmentSave;

  const owned: V2EquipInstance[] = [];
  const byIid = new Map<string, V2EquipInstance>();
  const idSeq = new Map<string, number>();
  const ownedRaw = Array.isArray(v.owned) ? v.owned : [];
  for (const entry of ownedRaw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as {
      iid?: unknown;
      id?: unknown;
      roll?: unknown;
      locked?: unknown;
      enhance?: unknown;
      craftQuality?: unknown;
      craftedBy?: unknown;
    };
    if (typeof e.id !== "string" || !VALID_IDS.has(e.id)) continue;
    const id = e.id as V2EquipmentId;
    let iid = typeof e.iid === "string" && e.iid.length > 0 ? e.iid : "";
    // 누락/중복 iid 는 결정적 스킴(`id~n`)으로 복구 — 랜덤이면 쓰기 전 반복 파싱에서 iid 가 매번
    // 달라져 equip/sell 이 not_owned 로 깨지는 footgun 차단(read=write 안정).
    if (!iid || byIid.has(iid)) {
      do {
        const seq = idSeq.get(id) ?? 0;
        idSeq.set(id, seq + 1);
        iid = `${id}~${seq}`;
      } while (byIid.has(iid));
    }
    const inst: V2EquipInstance = {
      iid,
      id,
      roll: parseEquipRoll(e.roll),
    };
    if (e.locked === true) inst.locked = true;
    const craftedBy = parseCraftedBy(e.craftedBy);
    const craftQuality = parseInstanceCraftQuality(e.craftQuality, e.enhance, craftedBy);
    const enhance = craftQuality ? undefined : parseEnhance(e.enhance);
    if (enhance) inst.enhance = enhance;
    if (craftQuality) inst.craftQuality = craftQuality;
    if (craftedBy) inst.craftedBy = craftedBy;
    owned.push(inst);
    byIid.set(iid, inst);
  }

  // equipped — 슬롯→iid. 옛(slot→id) 흡수: id 면 그 id 의 미배정 개체 하나를 잡는다(방어적 폴백).
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
      // slot→id 형식(방어적 폴백) — 그 종류 미배정 개체를 잡는다.
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
    // 강화/제작품질 — 위력만 배율(옵션·무게 불변)을 합성 roll 로 내려보냄. aggregate/엔진 무수정.
    // roll 없는 개체(상점 구매 등)도 카탈로그 위력 기준으로 강화 반영(weight 는 카탈로그,
    // options 미지정 = effectiveStats 가 카탈로그 옵션 사용 — 미강화와 동일 의미).
    const bonusPct = (inst.enhance?.bonusPct ?? 0) + (inst.craftQuality?.bonusPct ?? 0);
    if (bonusPct > 0) {
      const item = V2_EQUIPMENT[inst.id];
      const basePower = inst.roll?.power ?? item.power;
      rolls[inst.id] = {
        power: Math.floor(basePower * (1 + bonusPct / 100)),
        weight: inst.roll?.weight ?? item.weight,
        ...(inst.roll?.options ? { options: inst.roll.options } : {}),
      };
    } else if (inst.roll) {
      rolls[inst.id] = inst.roll;
    }
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

// 개체 잠금 토글 — iid 의 locked 설정. true 만 유지(false 는 키 제거 → 세이브 클린).
// 못 찾으면 원본 그대로. 잠금 = 일괄/실수 판매 방지.
export function setInstanceLock(
  owned: V2EquipInstance[],
  iid: string,
  locked: boolean,
): V2EquipInstance[] {
  return owned.map((i) => {
    if (i.iid !== iid) return i;
    if (locked) return { ...i, locked: true };
    const next = { ...i };
    delete next.locked;
    return next;
  });
}
