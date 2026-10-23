import {
  DROPPED_SPEC_TO_SURVIVING,
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
  type V2JobDefinition,
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
  | "6"
  | "7";

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
  ["7", "7차"],
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

function isCommonSkillId(skillId: string): boolean {
  return skillId.startsWith("v2_skill_") || skillId.startsWith("v2c_none_");
}

/** 스킬이 속한 직업. 공용·몬스터·알 수 없는 스킬은 null. 사라진 계파 id 는 이어받은 직업으로 정규화한다. */
export function skillSourceJob(skillId: string): V2JobDefinition | null {
  if (isCommonSkillId(skillId) || !skillId.startsWith("v2c_")) return null;
  const sourceJobId = skillId.split("_")[1];
  if (!sourceJobId) return null;
  const jobId = DROPPED_SPEC_TO_SURVIVING[sourceJobId] ?? sourceJobId;
  return V2_JOB_CATALOG[jobId] ?? null;
}

/** 스킬 카드에 붙이는 출처 표시. 공용 스킬은 "공용", 출처를 모르면 null. */
export function skillSourceJobLabel(skillId: string): string | null {
  if (isCommonSkillId(skillId)) return "공용";
  return skillSourceJob(skillId)?.name ?? null;
}

export function classifySkillForLibrary(
  skillId: string,
): SkillLibraryClassification | null {
  if (isCommonSkillId(skillId)) {
    return { tier: "common", lineage: "common" };
  }
  const job = skillSourceJob(skillId);
  if (!job) return null;
  const lineage = LEGACY_CLASS_SPEC_BY_JOB[job.id]?.class;
  if (
    !lineage ||
    !SKILL_LINEAGES.has(lineage as SkillLibraryClassification["lineage"])
  ) {
    return null;
  }

  const tier = job.tier === 0 ? 1 : job.tier;
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

/** "all" 또는 직업 id. */
export type SkillJobFilter = string;

const jobLineageCache = new Map<string, ReadonlySet<string>>();

/** 직업 자신과 전직 조건을 거슬러 올라간 모든 이전 차수 직업. 7차는 두 선행 계보를 모두 담는다. */
function jobLineageIds(jobId: string): ReadonlySet<string> {
  const cached = jobLineageCache.get(jobId);
  if (cached) return cached;
  const found = new Set<string>();
  const stack = [jobId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (found.has(id)) continue;
    const job = V2_JOB_CATALOG[id];
    if (!job) continue;
    found.add(id);
    stack.push(...Object.keys(job.unlock.prereqs));
    for (const condition of job.unlock.extraConditions ?? []) {
      if (condition.type === "jobUnlocked") stack.push(condition.jobId);
    }
  }
  jobLineageCache.set(jobId, found);
  return found;
}

export function jobHasEarlierLineage(jobId: string): boolean {
  return jobLineageIds(jobId).size > 1;
}

export function matchesSkillJob(
  skillId: string,
  jobFilter: SkillJobFilter,
  includeEarlierLineage: boolean,
): boolean {
  if (jobFilter === "all") return true;
  const job = skillSourceJob(skillId);
  if (!job) return false;
  return includeEarlierLineage
    ? jobLineageIds(jobFilter).has(job.id)
    : job.id === jobFilter;
}

export type SkillJobFilterGroup = {
  label: string;
  jobs: Array<{ id: string; name: string }>;
};

/** 직업 선택지. 보유 스킬의 출처 직업과 추가 직업(현재 직업 등)을 차수별·카탈로그 순서로 묶는다. */
export function skillJobFilterGroups(
  skillIds: readonly string[],
  extraJobIds: readonly (string | null | undefined)[] = [],
): SkillJobFilterGroup[] {
  const jobIds = new Set<string>();
  for (const skillId of skillIds) {
    const job = skillSourceJob(skillId);
    if (job) jobIds.add(job.id);
  }
  for (const jobId of extraJobIds) {
    if (jobId && jobId !== "none" && V2_JOB_CATALOG[jobId]) jobIds.add(jobId);
  }
  const byTier = new Map<number, SkillJobFilterGroup["jobs"]>();
  for (const job of Object.values(V2_JOB_CATALOG)) {
    if (!jobIds.has(job.id)) continue;
    const tier = job.tier === 0 ? 1 : job.tier;
    const jobs = byTier.get(tier) ?? [];
    jobs.push({ id: job.id, name: job.name });
    byTier.set(tier, jobs);
  }
  return [...byTier.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, jobs]) => ({ label: `${tier}차`, jobs }));
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
