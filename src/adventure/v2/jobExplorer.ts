import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
  V2_JOB_LIST,
  isLifestyleMasteryJobId,
} from "@/adventure/data/v2/v2JobCatalog";
import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";
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

export type JobAdvanceAction = {
  enabled: boolean;
  label: "전직" | "재전직" | "조건 부족" | `Lv ${number} 필요`;
  ariaLabel: string;
};

export function resolveJobAdvanceAction({
  job,
  currentJobId,
  atLevelCap,
  currentJobSelectable,
}: {
  job: Pick<JobExplorerJob, "id" | "name" | "unlocked">;
  currentJobId: string;
  atLevelCap: boolean;
  currentJobSelectable: boolean;
}): JobAdvanceAction {
  const isCurrent = job.id === currentJobId;
  const unlocked = job.unlocked !== false;
  const enabled = unlocked && (isCurrent ? currentJobSelectable : atLevelCap);
  const label = !unlocked
    ? "조건 부족"
    : !enabled
      ? (`Lv ${V2_LEVEL_CAP} 필요` as const)
      : isCurrent
        ? "재전직"
        : "전직";
  const actionName = isCurrent ? "재전직" : "전직";
  const ariaLabel = enabled
    ? isCurrent
      ? `${job.name} 재전직`
      : `${job.name}(으)로 전직`
    : `${job.name} ${actionName}: ${label}`;

  return { enabled, label, ariaLabel };
}

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
  "mutant",
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
  showOnCard?: boolean;
  matches: (job: JobExplorerJob, context?: JobExplorerContext) => boolean;
};

export function hasCollectedJobSkills(job: JobExplorerJob): boolean {
  return (
    job.skillsCollected === true ||
    ((job.skillsTotal ?? 0) > 0 &&
      (job.skillsLearned ?? 0) >= (job.skillsTotal ?? 0))
  );
}

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
    matches: (job) =>
      isLifestyleMasteryJobId(job.id) || ADDITIONAL_LIFE_JOB_IDS.has(job.id),
  },
  {
    key: "collected",
    label: "수집완료",
    showOnCard: false,
    matches: hasCollectedJobSkills,
  },
  {
    key: "incomplete",
    label: "수집미완료",
    showOnCard: false,
    matches: (job) => !hasCollectedJobSkills(job),
  },
];

const JOB_CARD_HIDDEN_TAG_LABELS = new Set(
  JOB_TAG_FILTERS.filter((filter) => filter.showOnCard === false).map(
    (filter) => filter.label,
  ),
);

export function toggleJobTagFilter(
  activeTags: ReadonlySet<string>,
  key: string,
): Set<string> {
  const next = new Set(activeTags);
  if (next.has(key)) {
    next.delete(key);
    return next;
  }
  if (key === "collected") next.delete("incomplete");
  if (key === "incomplete") next.delete("collected");
  next.add(key);
  return next;
}

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

export function jobCardTags(
  job: JobExplorerJob,
  context?: JobExplorerContext,
): string[] {
  return jobTags(job, context).filter(
    (tag) => !JOB_CARD_HIDDEN_TAG_LABELS.has(tag),
  );
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

// 생산직은 카탈로그 공용 판별을 사용해 새 계보가 추가돼도 자동으로 생활 탭에 포함한다.
// 아래 목록은 생활 숙련 조건으로 전직하는 생산직은 아니지만 기존 UI에서 생활 계열로 묶던 직업만 유지한다.
const ADDITIONAL_LIFE_JOB_IDS = new Set([
  "survivor",
  "camper",
  "fieldmedic",
  "rescueexpert",
  "healthtrainer",
  "physicalcoach",
  "mastertrainer",
  "championmaker",
  "legendarytrainer",
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
  if (isLifestyleMasteryJobId(jobId)) return undefined;
  const group = LEGACY_CLASS_SPEC_BY_JOB[jobId]?.class ?? jobId;
  return effectiveCultivateProfile(group, jobId);
}

/** 기본 수행 1회에 오르는 스탯 한계치를 카드 표기용으로 정렬해 반환한다. */
export function jobCultivationSummary(jobId: string): string {
  if (isLifestyleMasteryJobId(jobId)) return "생활직은 수행할 수 없음";
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
