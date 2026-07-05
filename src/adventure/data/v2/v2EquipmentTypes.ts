import type { V2Element } from "@/adventure/data/v2/elements";

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

export type V2EquipTier =
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
  | 13;

export type V2WeaponType =
  | "greatsword"
  | "staff"
  | "bow"
  | "dagger";

export type V2EquipRarity = "common" | "unique";

export type V2EquipOptions = {
  crit?: number;
  eva?: number;
  mp?: number;
  hp?: number;
  critMult?: number;
  spd?: number;
  def?: number;
  magicDef?: number;
  healPowerPct?: number;
  critResist?: number;
};

export type SignatureTrigger =
  | "battle_start"
  | "low_hp"
  | "on_heal"
  | "on_dodge"
  | "on_crit"
  | "on_hit"
  | "on_hit_taken"
  | "on_skill_cast"
  | "status_block_once"
  | "every_n_hits";

export type SignatureEffect = {
  trigger: SignatureTrigger;
  label: string;
  hpThresholdPct?: number;
  damageTakenReductionPct?: number;
  spdBuffPct?: number;
  buffActions?: number;
  healPct?: number;
  poisonOnCrit?: boolean;
  chillSlowPct?: number;
  poisonChancePct?: number;
  poisonStacks?: number;
  bleedChancePct?: number;
  bleedStacks?: number;
  shockChancePct?: number;
  shockSlowPct?: number;
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
  tier: V2EquipTier;
  name: string;
  description: string;
  power: number;
  weight: number;
  options?: V2EquipOptions;
  element?: V2Element;
  weaponType?: V2WeaponType;
  rarity?: V2EquipRarity;
  craftOnly?: boolean;
  starterOnly?: boolean;
  noDrop?: boolean;
  setId?: string;
  setTags?: readonly string[];
  signature?: SignatureEffect;
};
