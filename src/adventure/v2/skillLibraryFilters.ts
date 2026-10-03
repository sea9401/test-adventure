import {
  DROPPED_SPEC_TO_SURVIVING,
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
} from "@/adventure/data/v2/v2JobCatalog";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";

export type SkillJobTierFilter =
  | "all"
  | "common"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6";

export type SkillLineageFilter =
  | "all"
  | "common"
  | "warrior"
  | "martial"
  | "mage"
  | "rogue"
  | "survivor"
  | "mutant";

export type SkillLibraryClassification = {
  tier: Exclude<SkillJobTierFilter, "all">;
  lineage: Exclude<SkillLineageFilter, "all">;
};

export const SKILL_JOB_TIER_OPTIONS: ReadonlyArray<
  readonly [SkillJobTierFilter, string]
> = [
  ["all", "전체 차수"],
  ["common", "공용"],
  ["1", "1차"],
  ["2", "2차"],
  ["3", "3차"],
  ["4", "4차"],
  ["5", "5차"],
  ["6", "6차"],
];

export const SKILL_LINEAGE_OPTIONS: ReadonlyArray<
  readonly [SkillLineageFilter, string]
> = [
  ["all", "전체 계열"],
  ["common", "공용"],
  ["warrior", "전사 계열"],
  ["martial", "무도 계열"],
  ["mage", "마법 계열"],
  ["rogue", "도적 계열"],
  ["survivor", "생존 계열"],
  ["mutant", "변이자 계열"],
];

const SKILL_LINEAGES = new Set<SkillLibraryClassification["lineage"]>([
  "warrior",
  "martial",
  "mage",
  "rogue",
  "survivor",
  "mutant",
]);

export function classifySkillForLibrary(
  skillId: string,
): SkillLibraryClassification | null {
  if (skillId.startsWith("v2_skill_") || skillId.startsWith("v2c_none_")) {
    return { tier: "common", lineage: "common" };
  }
  if (!skillId.startsWith("v2c_")) return null;

  const sourceJobId = skillId.split("_")[1];
  if (!sourceJobId) return null;
  const jobId = DROPPED_SPEC_TO_SURVIVING[sourceJobId] ?? sourceJobId;
  const job = V2_JOB_CATALOG[jobId];
  const lineage = LEGACY_CLASS_SPEC_BY_JOB[jobId]?.class;
  if (
    !job ||
    !lineage ||
    !SKILL_LINEAGES.has(lineage as SkillLibraryClassification["lineage"])
  ) {
    return null;
  }

  const tier = job.tier === 0 ? 1 : job.tier;
  if (tier < 1 || tier > 6) return null;
  return {
    tier: String(tier) as SkillLibraryClassification["tier"],
    lineage: lineage as SkillLibraryClassification["lineage"],
  };
}
export function matchesSkillLibraryClassification(
  skillId: string,
  tierFilter: SkillJobTierFilter,
  lineageFilter: SkillLineageFilter,
): boolean {
  if (tierFilter === "all" && lineageFilter === "all") return true;
  const classification = classifySkillForLibrary(skillId);
  if (!classification) return false;
  return (
    (tierFilter === "all" || classification.tier === tierFilter) &&
    (lineageFilter === "all" || classification.lineage === lineageFilter)
  );
}

export type SkillDamageType = "physical" | "magic" | "bleed" | "poison" | "burn";
export type SkillDamageTypeFilter = "all" | SkillDamageType;

export const SKILL_DAMAGE_TYPE_LABELS: Record<SkillDamageType, string> = {
  physical: "물리 공격",
  magic: "마법 공격",
  bleed: "출혈",
  poison: "중독",
  burn: "연소",
};

export const SKILL_DAMAGE_TYPE_OPTIONS: ReadonlyArray<
  readonly [SkillDamageTypeFilter, string]
> = [
  ["all", "전체 유형"],
  ["physical", SKILL_DAMAGE_TYPE_LABELS.physical],
  ["magic", SKILL_DAMAGE_TYPE_LABELS.magic],
  ["bleed", SKILL_DAMAGE_TYPE_LABELS.bleed],
  ["poison", SKILL_DAMAGE_TYPE_LABELS.poison],
  ["burn", SKILL_DAMAGE_TYPE_LABELS.burn],
];

const SKILL_DAMAGE_TYPE_ORDER: readonly SkillDamageType[] = [
  "physical",
  "magic",
  "bleed",
  "poison",
  "burn",
];

// 효과 배열 밖의 전용 메커니즘으로 피해를 주는 스킬. 엔진의 실제 피해 판정과 맞춘다.
const SKILL_DAMAGE_TYPE_EXTRAS: Partial<Record<V2SkillId, readonly SkillDamageType[]>> = {
  v2c_lawweaver_release: ["magic"], // 각인 해방 추가 타격은 마법 피해
};

// 이름·설명 문구는 판별에 쓰지 않는다. 데이터 키만 본다.
const TEXT_KEYS = new Set(["name", "description", "detail", "label"]);

// 패시브 키 이름으로 판별하는 피해 강화·상태이상 계열. 마법 방어(magicDefPct·magicBarrier)처럼
//   받는 피해를 줄이는 키는 걸리지 않도록 공격 쪽 키만 고른다.
const KEY_PATTERNS: ReadonlyArray<readonly [SkillDamageType, RegExp]> = [
  ["physical", /PhysicalSkill|^physicalSkill|^enemyPhysical/],
  ["magic", /MagicSkill|^magicSkill|^enemyMagic/],
  ["bleed", /bleed/i],
  ["poison", /poison|venom|toxic/i],
  ["burn", /burn/i],
];

function isDamageEffectKind(kind: unknown): boolean {
  return (
    typeof kind === "string" &&
    kind !== "healFromDamage" &&
    (kind === "damage" || kind.endsWith("Damage"))
  );
}

function collectDamageTypes(value: unknown, out: Set<SkillDamageType>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectDamageTypes(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.kind === "dot") {
    const tag = record.tag;
    if (tag === "bleed" || tag === "poison" || tag === "burn") out.add(tag);
  } else if (isDamageEffectKind(record.kind)) {
    // 엔진과 같은 기준: 마법·정신 계수는 마법 피해, 그 외 계수는 물리 피해.
    out.add(
      record.scaling === "magic" || record.scaling === "spi"
        ? "magic"
        : "physical",
    );
  }
  for (const [key, child] of Object.entries(record)) {
    if (TEXT_KEYS.has(key)) continue;
    for (const [type, pattern] of KEY_PATTERNS) {
      if (pattern.test(key)) out.add(type);
    }
    collectDamageTypes(child, out);
  }
}

const damageTypeCache = new Map<string, readonly SkillDamageType[]>();

export function skillDamageTypes(skillId: string): readonly SkillDamageType[] {
  const cached = damageTypeCache.get(skillId);
  if (cached) return cached;
  const skill = V2_SKILLS[skillId as V2SkillId];
  const found = new Set<SkillDamageType>();
  if (skill) {
    collectDamageTypes(skill, found);
    for (const type of SKILL_DAMAGE_TYPE_EXTRAS[skill.id] ?? []) found.add(type);
  }
  const types = SKILL_DAMAGE_TYPE_ORDER.filter((type) => found.has(type));
  damageTypeCache.set(skillId, types);
  return types;
}

export function matchesSkillDamageType(
  skillId: string,
  filter: SkillDamageTypeFilter,
): boolean {
  return filter === "all" || skillDamageTypes(skillId).includes(filter);
}
