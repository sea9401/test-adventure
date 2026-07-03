import { V2_JOB_CATALOG } from "@/adventure/data/v2/v2JobCatalog";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";

export const JOB_GOAL_STORAGE_KEY = "adventure.v2.jobGoalId";

export type JobExplorerJob = {
  id: string;
  name: string;
  tier?: number;
  condition?: string;
  bonus?: string;
  unlocked?: boolean;
  isCurrent?: boolean;
  skillsCollected?: boolean;
  skillsLearned?: number;
  skillsTotal?: number;
  conditionRevealed?: boolean;
};

export type JobExplorerContext = {
  currentJobId?: string | null;
};

export function isJobVisibleInShrine(
  job: Pick<JobExplorerJob, "unlocked" | "conditionRevealed">,
): boolean {
  return job.unlocked !== false || job.conditionRevealed !== false;
}

export type JobTagFilter = {
  key: string;
  label: string;
  matches: (job: JobExplorerJob, context?: JobExplorerContext) => boolean;
};

export const JOB_TAG_FILTERS: JobTagFilter[] = [
  { key: "tier-1", label: "기본", matches: (job) => job.tier === 1 },
  {
    key: "line",
    label: "상위",
    matches: (job, context) =>
      job.unlocked !== false && isSameJobLine(job.id, context?.currentJobId),
  },
  { key: "str", label: "힘", matches: (job) => jobUsesStat(job.id, "str") },
  { key: "vit", label: "활력", matches: (job) => jobUsesStat(job.id, "vit") },
  { key: "dex", label: "민첩", matches: (job) => jobUsesStat(job.id, "dex") },
  { key: "int", label: "지능", matches: (job) => jobUsesStat(job.id, "int") },
  { key: "spi", label: "정신", matches: (job) => jobUsesStat(job.id, "spi") },
  { key: "luk", label: "행운", matches: (job) => jobUsesStat(job.id, "luk") },
  {
    key: "life",
    label: "생활",
    matches: (job) => LIFE_JOB_IDS.has(job.id),
  },
  {
    key: "collected",
    label: "수집완료",
    matches: (job) =>
      job.skillsCollected === true ||
      ((job.skillsTotal ?? 0) > 0 &&
        (job.skillsLearned ?? 0) >= (job.skillsTotal ?? 0)),
  },
];

export function normalizeJobQuery(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function jobTierLabel(tier?: number): string {
  if (!tier) return "";
  if (tier === 1) return "기본";
  return "";
}

export function jobTags(
  job: JobExplorerJob,
  context?: JobExplorerContext,
): string[] {
  const tierLabel = jobTierLabel(job.tier);
  const tags = tierLabel ? [tierLabel] : [];
  for (const filter of JOB_TAG_FILTERS) {
    if (filter.key === "tier-1") continue;
    if (filter.matches(job, context)) tags.push(filter.label);
  }
  return [...new Set(tags)];
}

export function matchesJobExplorerFilters(
  job: JobExplorerJob,
  query: string,
  tagKeys: ReadonlySet<string>,
  context?: JobExplorerContext,
): boolean {
  const q = normalizeJobQuery(query);
  const haystack = [
    job.id,
    job.name,
    job.conditionRevealed === false ? "" : (job.condition ?? ""),
    job.bonus ?? "",
    jobTierLabel(job.tier),
    ...jobTags(job, context),
    job.unlocked === false ? "잠김 조건부 조건부족" : "해금 가능",
    job.isCurrent ? "현재 직업" : "",
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR");
  if (q && !haystack.includes(q)) return false;
  for (const key of tagKeys) {
    const filter = JOB_TAG_FILTERS.find((f) => f.key === key);
    if (filter && !filter.matches(job, context)) return false;
  }
  return true;
}

const LIFE_JOB_IDS = new Set([
  "survivor",
  "camper",
  "fieldmedic",
  "rescueexpert",
  "fisher",
  "angler",
  "masterangler",
  "fullcatchking",
  "seagod",
  "healthtrainer",
  "physicalcoach",
  "mastertrainer",
]);

function jobUsesStat(jobId: string, stat: V2StatKey): boolean {
  const def = V2_JOB_CATALOG[jobId];
  if (!def) return false;
  return (def.cultivateProfile[stat] ?? 0) > 0 || (def.jobBonus[stat] ?? 0) > 0;
}

function isSameJobLine(
  jobId: string,
  currentJobId: string | null | undefined,
): boolean {
  if (!currentJobId) return false;
  if (jobId === currentJobId) return true;
  const currentRoots = rootJobIds(currentJobId);
  if (currentRoots.size === 0) return false;
  for (const root of rootJobIds(jobId)) {
    if (currentRoots.has(root)) return true;
  }
  return false;
}

function rootJobIds(jobId: string, seen = new Set<string>()): Set<string> {
  if (seen.has(jobId)) return new Set();
  seen.add(jobId);

  const def = V2_JOB_CATALOG[jobId];
  if (!def) return new Set();
  const prereqIds = Object.keys(def.unlock.prereqs);
  if (prereqIds.length === 0) return new Set([jobId]);

  const roots = new Set<string>();
  for (const prereqId of prereqIds) {
    for (const root of rootJobIds(prereqId, seen)) roots.add(root);
  }
  return roots;
}
