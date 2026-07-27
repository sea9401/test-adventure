import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
  V2_JOB_LIST,
} from "@/adventure/data/v2/v2JobCatalog";
import { effectiveCultivateProfile } from "@/adventure/data/v2/proficiency";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";

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

const JOB_LINE_ROOT_ORDER = [
  "none",
  "warrior",
  "martial",
  "mage",
  "rogue",
  "survivor",
];

const JOB_CATALOG_INDEX = new Map(
  V2_JOB_LIST.map((job, index) => [job.id, index] as const),
);

const JOB_LINE_ORDER = buildJobLineOrder();

export function compareJobExplorerLineOrder(
  a: Pick<JobExplorerJob, "id" | "name" | "tier">,
  b: Pick<JobExplorerJob, "id" | "name" | "tier">,
): number {
  return (
    jobLineOrderOf(a.id) - jobLineOrderOf(b.id) ||
    (a.tier ?? 99) - (b.tier ?? 99) ||
    a.name.localeCompare(b.name, "ko-KR") ||
    a.id.localeCompare(b.id)
  );
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
  "championmaker",
  "legendarytrainer",
  "farmer",
  "horticulturist",
  "masterfarmer",
  "harvestking",
  "earthartisan",
]);

function jobUsesStat(jobId: string, stat: V2StatKey): boolean {
  const profile = jobCultivationProfile(jobId);
  if (!profile) return false;
  // 성장의 신전 스탯 필터/태그는 수행으로 한계치를 올릴 수 있는 스탯만 뜻한다.
  // 직업 보너스까지 섞으면, 예를 들어 궁수의 힘 보너스가 수행 가능 스탯처럼 보인다.
  return (profile[stat] ?? 0) > 0;
}

/** 수행 라우트와 동일한 직군·직업 오버라이드 규칙으로 실효 프로필을 구한다. */
export function jobCultivationProfile(
  jobId: string,
): Partial<Record<V2StatKey, number>> | undefined {
  if (!V2_JOB_CATALOG[jobId]) return undefined;
  const group = LEGACY_CLASS_SPEC_BY_JOB[jobId]?.class ?? jobId;
  return effectiveCultivateProfile(group, jobId);
}

/** 기본 수행 1회에 오르는 스탯 한계치를 카드 표기용으로 정렬해 반환한다. */
export function jobCultivationSummary(jobId: string): string {
  const profile = jobCultivationProfile(jobId);
  if (!profile) return "";
  return [...V2_STAT_KEYS]
    .filter((stat) => (profile[stat] ?? 0) > 0)
    .sort((a, b) => (profile[b] ?? 0) - (profile[a] ?? 0))
    .map((stat) => `${V2_STAT_LABELS[stat]} +${profile[stat]}`)
    .join(" · ");
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

function buildJobLineOrder(): Map<string, number> {
  const childrenByParent = new Map<string, string[]>();
  for (const job of V2_JOB_LIST) {
    const primaryParent = Object.keys(job.unlock.prereqs)[0];
    if (!primaryParent) continue;
    const children = childrenByParent.get(primaryParent) ?? [];
    children.push(job.id);
    childrenByParent.set(primaryParent, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort(
      (a, b) =>
        (JOB_CATALOG_INDEX.get(a) ?? 9999) -
        (JOB_CATALOG_INDEX.get(b) ?? 9999),
    );
  }

  const order = new Map<string, number>();
  let next = 0;
  const visit = (jobId: string) => {
    if (order.has(jobId) || !V2_JOB_CATALOG[jobId]) return;
    order.set(jobId, next);
    next += 1;
    for (const childId of childrenByParent.get(jobId) ?? []) visit(childId);
  };

  for (const rootId of JOB_LINE_ROOT_ORDER) visit(rootId);
  for (const job of V2_JOB_LIST) visit(job.id);
  return order;
}

function jobLineOrderOf(jobId: string): number {
  return (
    JOB_LINE_ORDER.get(jobId) ??
    10000 + (JOB_CATALOG_INDEX.get(jobId) ?? 9999)
  );
}
