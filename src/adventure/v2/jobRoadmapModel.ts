import {
  isLifestyleMasteryJobId,
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
  V2_JOB_LIST,
  type V2JobDefinition,
} from "@/adventure/data/v2/v2JobCatalog";

export type JobRoadmapNode = {
  id: string;
  name: string;
  tier: V2JobDefinition["tier"] | "start";
  group: string;
  hybrid: boolean;
  /** 전투 레벨 제한 없이 생활 숙련 조건으로 전직하는 생산직 계열. */
  production: boolean;
  prerequisiteJobIds: string[];
  prereqText: string;
  children: JobRoadmapNode[];
};

export function buildJobRoadmap(): JobRoadmapNode {
  return buildJobRoadmapFromJobs(V2_JOB_LIST);
}

export function roadmapRootJumpTargets(
  root: JobRoadmapNode,
): Array<{ id: string; label: string }> {
  return root.children
    .filter((node) => node.tier === 0)
    .map((node) => ({ id: node.id, label: node.name }));
}

export function buildJobRoadmapFromJobs(
  jobs: readonly V2JobDefinition[],
): JobRoadmapNode {
  const jobById = new Map(jobs.map((job) => [job.id, job] as const));
  const jobOrder = new Map(jobs.map((job, index) => [job.id, index] as const));
  const childrenByParent = new Map<string, V2JobDefinition[]>();
  for (const job of jobs) {
    const parent = primaryParentId(job);
    const children = childrenByParent.get(parent) ?? [];
    children.push(job);
    childrenByParent.set(parent, children);
  }

  const toNode = (job: V2JobDefinition): JobRoadmapNode => {
    const prerequisiteIds = prerequisiteJobIds(job);
    return {
      id: job.id,
      name: job.name,
      tier: job.tier,
      group: groupForJob(job),
      hybrid: prerequisiteIds.length > 1,
      production: isLifestyleMasteryJobId(job.id),
      prerequisiteJobIds: prerequisiteIds,
      prereqText: prereqText(job, jobById),
      children: sortedChildren(
        childrenByParent.get(job.id) ?? [],
        jobOrder,
      ).map(toNode),
    };
  };

  return {
    id: "start",
    name: "시작",
    tier: "start",
    group: "root",
    hybrid: false,
    production: false,
    prerequisiteJobIds: [],
    prereqText: "",
    children: sortedChildren(
      childrenByParent.get("start") ?? [],
      jobOrder,
    ).map(toNode),
  };
}

function primaryParentId(job: V2JobDefinition): string {
  if (job.id === "none" || job.id === "survivor" || job.id === "mutant") {
    return "start";
  }
  return prerequisiteJobIds(job)[0] ?? "none";
}

function prerequisiteJobIds(job: V2JobDefinition): string[] {
  const ids = Object.keys(job.unlock.prereqs);
  for (const condition of job.unlock.extraConditions ?? []) {
    if (condition.type === "jobUnlocked" && !ids.includes(condition.jobId)) {
      ids.push(condition.jobId);
    }
  }
  return ids;
}

function sortedChildren(
  children: V2JobDefinition[],
  jobOrder: ReadonlyMap<string, number>,
): V2JobDefinition[] {
  return [...children].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (jobOrder.get(a.id) ?? 0) - (jobOrder.get(b.id) ?? 0);
  });
}

function groupForJob(job: V2JobDefinition): string {
  if (job.id === "none") return "root";
  return LEGACY_CLASS_SPEC_BY_JOB[job.id]?.class ?? job.id;
}

function prereqText(
  job: V2JobDefinition,
  jobById: ReadonlyMap<string, V2JobDefinition>,
): string {
  const parts = Object.entries(job.unlock.prereqs).map(
    ([id, level]) =>
      `${jobById.get(id)?.name ?? V2_JOB_CATALOG[id]?.name ?? id} 숙련도 ${level}`,
  );
  for (const condition of job.unlock.extraConditions ?? []) {
    switch (condition.type) {
      case "jobUnlocked":
        parts.push(
          `${jobById.get(condition.jobId)?.name ?? V2_JOB_CATALOG[condition.jobId]?.name ?? condition.jobId} 해금`,
        );
        break;
      case "farmingLevel":
        parts.push(`농사 Lv.${condition.min}`);
        break;
      case "cookingLevel":
        parts.push(`요리 Lv.${condition.min}`);
        break;
      case "woodcuttingLevel":
        parts.push(`벌목 Lv.${condition.min}`);
        break;
      case "miningLevel":
        parts.push(`채광 Lv.${condition.min}`);
        break;
      case "statThreshold":
        parts.push(`${condition.stat.toUpperCase()} 한계 ${condition.min}`);
        break;
      case "questCompleted":
        parts.push(`퀘스트 ${condition.questId} 완료`);
        break;
      case "monsterKilled":
        parts.push(`${condition.monsterId} ${condition.minCount}회 처치`);
        break;
    }
  }
  return parts.join(", ");
}
