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
};

export type JobTagFilter = {
  key: string;
  label: string;
  matches: (job: JobExplorerJob) => boolean;
};

export const JOB_TAG_FILTERS: JobTagFilter[] = [
  { key: "tier-1", label: "기본", matches: (job) => job.tier === 1 },
  { key: "tier-2", label: "상위", matches: (job) => job.tier === 2 },
  { key: "tier-3", label: "고차", matches: (job) => job.tier === 3 },
  { key: "tier-4", label: "심화", matches: (job) => job.tier === 4 },
  { key: "tier-5", label: "최종", matches: (job) => job.tier === 5 },
  { key: "tier-6", label: "초월", matches: (job) => job.tier === 6 },
  { key: "str", label: "힘", matches: (job) => hasText(job, "힘") },
  { key: "vit", label: "활력", matches: (job) => hasText(job, "활력") },
  { key: "dex", label: "민첩", matches: (job) => hasText(job, "민첩") },
  { key: "int", label: "지능", matches: (job) => hasText(job, "지능") },
  { key: "spi", label: "정신", matches: (job) => hasText(job, "정신") },
  { key: "luk", label: "행운", matches: (job) => hasText(job, "행운") },
  {
    key: "hybrid",
    label: "복합",
    matches: (job) => (job.condition?.includes(",") ?? false) || isHybridName(job),
  },
  {
    key: "life",
    label: "생활",
    matches: (job) =>
      ["survivor", "camper", "fisher", "angler", "masterangler"].some(
        (s) => job.id.includes(s),
      ) || /생존|야영|낚시|강태공|구조/.test(job.name),
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
  if (!tier) return "루트";
  if (tier === 1) return "기본";
  if (tier === 2) return "상위";
  if (tier === 3) return "고차";
  if (tier === 4) return "심화";
  if (tier === 5) return "최종";
  return "초월";
}

export function jobTags(job: JobExplorerJob): string[] {
  const tags = [jobTierLabel(job.tier)];
  for (const filter of JOB_TAG_FILTERS) {
    if (filter.key.startsWith("tier-")) continue;
    if (filter.matches(job)) tags.push(filter.label);
  }
  return [...new Set(tags)];
}

export function matchesJobExplorerFilters(
  job: JobExplorerJob,
  query: string,
  tagKeys: ReadonlySet<string>,
): boolean {
  const q = normalizeJobQuery(query);
  const haystack = [
    job.id,
    job.name,
    job.condition ?? "",
    job.bonus ?? "",
    jobTierLabel(job.tier),
    ...jobTags(job),
    job.unlocked === false ? "잠김 조건부 조건부족" : "해금 가능",
    job.isCurrent ? "현재 직업" : "",
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR");
  if (q && !haystack.includes(q)) return false;
  for (const key of tagKeys) {
    const filter = JOB_TAG_FILTERS.find((f) => f.key === key);
    if (filter && !filter.matches(job)) return false;
  }
  return true;
}

function hasText(job: JobExplorerJob, needle: string): boolean {
  return `${job.name} ${job.bonus ?? ""} ${job.condition ?? ""}`.includes(
    needle,
  );
}

function isHybridName(job: JobExplorerJob): boolean {
  return /성기사|마검사|혈성기사|암흑사제|성전사|룬 기사/.test(job.name);
}
