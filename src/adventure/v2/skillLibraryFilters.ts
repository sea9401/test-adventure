import {
  DROPPED_SPEC_TO_SURVIVING,
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
} from "@/adventure/data/v2/v2JobCatalog";

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
