import type { StatKey } from "@/adventure/data/stats";
import type { V2Equipment } from "./v2Equipment";
import type {
  V2PassiveSkillEffect,
  V2SkillDefinition,
  V2SkillEffect,
} from "./v2Skills";

// PoB식 빌드 탐색용 공용 태그. 장비·스킬·향후 옵션 템플릿이 같은 id 를 공유한다.
export type V2BuildTagId =
  | "str"
  | "dex"
  | "vit"
  | "spd"
  | "luk"
  | "int"
  | "spi"
  | "physical"
  | "magic"
  | "crit"
  | "evasion"
  | "speed"
  | "tank"
  | "heal"
  | "shield"
  | "low_hp"
  | "poison"
  | "bleed"
  | "burn"
  | "dot"
  | "vulnerability"
  | "execute"
  | "pierce"
  | "resource"
  | "fishing"
  | "guild"
  | "signature"
  | "set";

export type V2BuildTagDef = {
  id: V2BuildTagId;
  label: string;
  group: "stat" | "combat" | "status" | "utility" | "collection";
  showInEquipmentCodex?: boolean;
};

export const V2_BUILD_TAGS: readonly V2BuildTagDef[] = [
  { id: "str", label: "STR", group: "stat" },
  { id: "dex", label: "DEX", group: "stat" },
  { id: "vit", label: "VIT", group: "stat" },
  { id: "spd", label: "SPD", group: "stat" },
  { id: "luk", label: "LUK", group: "stat" },
  { id: "int", label: "INT", group: "stat" },
  { id: "spi", label: "SPI", group: "stat" },
  { id: "physical", label: "물리", group: "combat" },
  { id: "magic", label: "마법", group: "combat", showInEquipmentCodex: true },
  { id: "crit", label: "치명", group: "combat", showInEquipmentCodex: true },
  { id: "evasion", label: "회피", group: "combat", showInEquipmentCodex: true },
  { id: "speed", label: "속도", group: "combat", showInEquipmentCodex: true },
  { id: "tank", label: "탱커", group: "combat", showInEquipmentCodex: true },
  { id: "heal", label: "회복", group: "combat", showInEquipmentCodex: true },
  { id: "shield", label: "보호막", group: "combat" },
  { id: "low_hp", label: "저체력", group: "combat" },
  { id: "poison", label: "독", group: "status", showInEquipmentCodex: true },
  { id: "bleed", label: "출혈", group: "status", showInEquipmentCodex: true },
  { id: "burn", label: "화상", group: "status" },
  { id: "dot", label: "지속피해", group: "status" },
  { id: "vulnerability", label: "취약", group: "status" },
  { id: "execute", label: "처형", group: "combat" },
  { id: "pierce", label: "관통", group: "combat" },
  { id: "resource", label: "자원", group: "utility" },
  { id: "fishing", label: "낚시", group: "utility" },
  { id: "guild", label: "길드", group: "utility" },
  {
    id: "signature",
    label: "시그니처",
    group: "collection",
    showInEquipmentCodex: true,
  },
  { id: "set", label: "세트", group: "collection", showInEquipmentCodex: true },
];

export const V2_BUILD_TAG_LABEL: Record<V2BuildTagId, string> =
  Object.fromEntries(V2_BUILD_TAGS.map((tag) => [tag.id, tag.label])) as Record<
    V2BuildTagId,
    string
  >;

export const V2_EQUIPMENT_CODEX_BUILD_TAG_FILTERS: readonly V2BuildTagId[] =
  V2_BUILD_TAGS.filter((tag) => tag.showInEquipmentCodex).map((tag) => tag.id);

type V2EquipmentOptionKey = keyof NonNullable<V2Equipment["options"]>;

export const V2_EQUIPMENT_OPTION_BUILD_TAGS: Readonly<
  Partial<Record<V2EquipmentOptionKey, readonly V2BuildTagId[]>>
> = {
  crit: ["crit"],
  eva: ["evasion"],
  mp: ["magic", "resource"],
  hp: ["tank"],
  critMult: ["crit"],
  spd: ["speed"],
  def: ["tank"],
  magicDef: ["magic", "tank"],
  healPowerPct: ["magic", "heal"],
  critResist: ["tank"],
};

function addStatTag(tags: Set<V2BuildTagId>, stat: StatKey): void {
  if (stat === "str") tags.add("str");
  if (stat === "dex") tags.add("dex");
  if (stat === "vit") tags.add("vit");
  if (stat === "spd") tags.add("spd");
  if (stat === "luk") tags.add("luk");
  if (stat === "int") tags.add("int");
}

export function buildTagsForEquipment(item: V2Equipment): V2BuildTagId[] {
  const tags = new Set<V2BuildTagId>(item.buildTags ?? []);
  const options = item.options ?? {};
  for (const key of Object.keys(options) as V2EquipmentOptionKey[]) {
    if ((options[key] ?? 0) <= 0) continue;
    for (const tag of V2_EQUIPMENT_OPTION_BUILD_TAGS[key] ?? []) {
      tags.add(tag);
    }
  }

  if (item.weaponType) tags.add("physical");
  if (
    item.concept === "int" ||
    item.concept === "mana" ||
    item.weaponType === "staff"
  ) {
    tags.add("magic");
  }
  if (
    item.concept === "heavy" ||
    (item.signature?.damageTakenReductionPct ?? 0) > 0 ||
    (item.signature?.defGainOnHitPct ?? 0) > 0
  ) {
    tags.add("tank");
  }
  if (
    (options.healPowerPct ?? 0) > 0 ||
    (item.signature?.healPct ?? 0) > 0 ||
    (item.signature?.healToShieldPct ?? 0) > 0
  ) {
    tags.add("heal");
  }
  if ((item.signature?.battleStartShieldPctMaxHp ?? 0) > 0) tags.add("shield");
  if (item.signature?.trigger === "low_hp") tags.add("low_hp");
  if (
    item.signature?.poisonOnCrit ||
    (item.signature?.poisonChancePct ?? 0) > 0
  ) {
    tags.add("poison");
    tags.add("dot");
  }
  if ((item.signature?.bleedChancePct ?? 0) > 0) {
    tags.add("bleed");
    tags.add("dot");
  }
  if ((item.signature?.enemyDefDebuffPct ?? 0) > 0) tags.add("vulnerability");
  if ((item.signature?.mpRefundPctOfCost ?? 0) > 0) tags.add("resource");
  if (item.signature) tags.add("signature");
  if (item.setId || (item.setTags?.length ?? 0) > 0) tags.add("set");

  return orderedBuildTags(tags);
}

export function equipmentHasBuildTag(
  item: V2Equipment,
  tag: V2BuildTagId,
): boolean {
  return buildTagsForEquipment(item).includes(tag);
}

export function buildTagsForSkill(skill: V2SkillDefinition): V2BuildTagId[] {
  const tags = new Set<V2BuildTagId>(skill.buildTags ?? []);
  addStatTag(tags, skill.stat);
  if (skill.stat === "int") tags.add("magic");
  if (skill.category === "heal") tags.add("heal");
  if (skill.category === "passive" && skill.passive) {
    addPassiveTags(tags, skill.passive);
  }
  for (const effect of skill.effects) addEffectTags(tags, effect);
  for (const effectSet of Object.values(skill.elementEffects ?? {})) {
    for (const effect of effectSet ?? []) addEffectTags(tags, effect);
  }
  for (const synergy of skill.equippedSynergies ?? []) {
    for (const effect of synergy.effects) addEffectTags(tags, effect);
  }
  return orderedBuildTags(tags);
}

function addPassiveTags(
  tags: Set<V2BuildTagId>,
  passive: V2PassiveSkillEffect,
): void {
  for (const stat of Object.keys(passive.stat ?? {}) as StatKey[]) {
    addStatTag(tags, stat);
  }
  for (const stat of Object.keys(passive.statPct ?? {}) as StatKey[]) {
    addStatTag(tags, stat);
  }
  if ((passive.maxHpPct ?? 0) > 0 || (passive.defPct ?? 0) > 0) {
    tags.add("tank");
  }
  if ((passive.maxMpPct ?? 0) > 0 || (passive.profPerKillBonus ?? 0) > 0) {
    tags.add("resource");
  }
  if ((passive.critPct ?? 0) > 0 || (passive.critDmgPct ?? 0) > 0) {
    tags.add("crit");
  }
  if ((passive.evasionPct ?? 0) > 0) tags.add("evasion");
  if ((passive.healPowerPct ?? 0) > 0 || (passive.lifestealPct ?? 0) > 0) {
    tags.add("heal");
  }
  if ((passive.damageTakenReductionPct ?? 0) > 0) tags.add("tank");
  if ((passive.magicDefPct ?? 0) > 0) tags.add("magic");
  if ((passive.poisonedEnemyDefReductionPct ?? 0) > 0) {
    tags.add("poison");
    tags.add("vulnerability");
  }
  if ((passive.berserkAtkPctPerLostHpPct ?? 0) > 0) tags.add("low_hp");
  if ((passive.enemyMagicVulnPctPerStack ?? 0) > 0) tags.add("vulnerability");
  if ((passive.magicSkillDamagePct ?? 0) > 0) tags.add("magic");
  if ((passive.fishingSizeBonusPct ?? 0) > 0) tags.add("fishing");
  if ((passive.fishingSpecialWeightPct ?? 0) > 0) tags.add("fishing");
  if ((passive.fishingRareSizeBonusPct ?? 0) > 0) tags.add("fishing");
  if ((passive.fishingBigCatchSizeBonusPct ?? 0) > 0) tags.add("fishing");
  if ((passive.guildTrainingRewardBonusPct ?? 0) > 0) tags.add("guild");
  if ((passive.guildTrainingWeeklyBonusMastery ?? 0) > 0) tags.add("guild");
  if (passive.skillCritOverflow) tags.add("crit");
}

function addEffectTags(
  tags: Set<V2BuildTagId>,
  effect: V2SkillEffect,
): void {
  switch (effect.kind) {
    case "damage":
      tags.add(effect.scaling === "magic" ? "magic" : "physical");
      if ((effect.pierceDamagePct ?? 0) > 0) tags.add("pierce");
      break;
    case "heal":
    case "healFromDamage":
    case "healToDamage":
    case "selfRegen":
      tags.add("heal");
      break;
    case "selfBuff":
      addStatTag(tags, effect.stat);
      if (effect.stat === "spd") tags.add("speed");
      break;
    case "selfBuffPct":
      if (effect.target === "evasion") tags.add("evasion");
      if (effect.target === "crit") tags.add("crit");
      if (effect.target === "damageReduction") tags.add("tank");
      break;
    case "shield":
      tags.add("shield");
      tags.add("tank");
      break;
    case "manaRestore":
      tags.add("resource");
      break;
    case "enemyDebuff":
    case "enemyVuln":
    case "enemyEvasionDown":
    case "enemyAccuracyDown":
    case "enemyDamageDown":
    case "enemySkillProcDown":
    case "enemyDotVuln":
      tags.add("vulnerability");
      break;
    case "selfHaste":
    case "enemyDelay":
      tags.add("speed");
      break;
    case "enemyHealReduce":
      tags.add("vulnerability");
      break;
    case "hpCostDamage":
      tags.add("low_hp");
      tags.add(effect.scaling === "magic" ? "magic" : "physical");
      break;
    case "executeDamage":
    case "ambushDamage":
      tags.add("execute");
      tags.add(effect.scaling === "magic" ? "magic" : "physical");
      break;
    case "stackPayoffDamage":
      tags.add(effect.tag === "magicVuln" ? "vulnerability" : effect.tag);
      tags.add("dot");
      break;
    case "dot":
      tags.add(effect.tag);
      tags.add("dot");
      break;
  }
}

function orderedBuildTags(tags: ReadonlySet<V2BuildTagId>): V2BuildTagId[] {
  return V2_BUILD_TAGS.map((tag) => tag.id).filter((id) => tags.has(id));
}
