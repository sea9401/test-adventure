import type { V2Element } from "@/adventure/data/v2/elements";
import type { V2BuildTagId } from "./buildTags";

// 6슬롯(2026-06): 무기 / 갑옷 / 장갑 / 신발 / 반지 / 목걸이.
export type V2EquipSlot =
  | "weapon"
  | "armor"
  | "gloves"
  | "boots"
  | "ring"
  | "necklace";

export type V2EquipConcept =
  | "str"
  | "dex"
  | "int"
  | "heavy"
  | "light"
  | "luck"
  | "mana";

export type V2EquipCatalogTier =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 16;

export type V2WeaponType =
  | "greatsword"
  | "staff"
  | "bow"
  | "dagger";

export type V2EquipRarity = "common" | "unique";

export type V2EquipOptions = {
  crit?: number;
  eva?: number;
  /** 회피형 적을 상대하는 명중 보정 수치. */
  accuracy?: number;
  mp?: number;
  hp?: number;
  critMult?: number;
  spd?: number;
  def?: number;
  magicDef?: number;
  healPowerPct?: number;
  critResist?: number;
  /** 중독·출혈 등 status_damage 로 분류되는 피해 감소율. */
  statusDamageReductionPct?: number;
};

export type SignatureTrigger =
  | "battle_start"
  | "low_hp"
  | "on_heal"
  | "on_dodge"
  | "on_action_evasion"
  | "on_crit"
  | "on_hit"
  | "on_hit_taken"
  | "on_skill_cast"
  | "status_block_once"
  | "every_n_hits"
  | "tier6_unique";

export type Tier6UniqueMechanic =
  | "gravity_reprisal"
  | "gravity_feedback"
  | "bleed_burst"
  | "bleed_aftermath"
  | "pursuit_mark"
  | "shadow_echo"
  | "venom_burst"
  | "venom_balance"
  | "arcane_overload"
  | "arcane_feedback"
  | "sanctuary_reserve"
  | "mechanic_unity"
  | "shield_conversion"
  | "gale_circuit"
  | "status_mana_return"
  | "triphase_link"
  | "storm_confluence"
  | "dominant_heart";

export type SignatureEffect = {
  trigger: SignatureTrigger;
  label: string;
  mechanic?: Tier6UniqueMechanic;
  hpThresholdPct?: number;
  damageTakenReductionPct?: number;
  spdBuffPct?: number;
  buffActions?: number;
  lostHpHealPct?: number;
  poisonOnCrit?: boolean;
  chillSlowPct?: number;
  poisonChancePct?: number;
  poisonStacks?: number;
  bleedChancePct?: number;
  bleedStacks?: number;
  shockChancePct?: number;
  enemyDefDebuffPct?: number;
  defGainOnHitPct?: number;
  battleStartShieldPctMaxHp?: number;
  mpRefundPctOfCost?: number;
  healToShieldPct?: number;
  statusBlockOnce?: boolean;
  everyNHits?: number;
};

export type V2EquipmentBase<Id extends string = string> = {
  id: Id;
  slot: V2EquipSlot;
  concept: V2EquipConcept;
  /** 내부 카탈로그 단계. 화면 표시는 V2EquipDisplayTier 로 압축해서 노출한다. */
  tier: V2EquipCatalogTier;
  name: string;
  description: string;
  power: number;
  weight: number;
  options?: V2EquipOptions;
  element?: V2Element;
  weaponType?: V2WeaponType;
  rarity?: V2EquipRarity;
  craftOnly?: boolean;
  /** 정규 드랍 제외. T1 수련용 장비는 상점에서 구매할 수 있다. */
  starterOnly?: boolean;
  noDrop?: boolean;
  setId?: string;
  setTags?: readonly string[];
  /** PoB식 빌드 탐색 태그. 생략 시 옵션·시그니처 기반 태그를 자동 추론한다. */
  buildTags?: readonly V2BuildTagId[];
  signature?: SignatureEffect;
};
