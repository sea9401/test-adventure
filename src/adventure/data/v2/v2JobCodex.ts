// 직업 도감(A 메타 PR-1) — 읽기 전용 수집 대시보드 데이터 빌더(순수). 직업 해금/직군 정복/패시브
//   수집 현황을 모은다. 엔드포인트(api/v2/me/job-codex)와 dev 하네스가 공유. 파워 무관.
//
// 🔑 정복(mastered)은 **직군별**(cumLevel 은 4 직군 단위 — 전사/무인/마법사/도적). 직업별 정복은
//   후속(A 메타 PR-2/3) 설계 — 여기선 현재 데이터(직군 cumLevel)를 그대로 표기한다.

import {
  V2_JOB_CATALOG,
  V2_JOB_LIST,
  LEGACY_CLASS_SPEC_BY_JOB,
  isJobUnlocked,
  jobIdFromLegacy,
} from "./v2JobCatalog";
import { groupCumLevel, type V2ProficiencyState } from "./proficiency";
import { SP_MASTERED_CUMLEVEL } from "./coreLoopConfig";
import { skillsForJob } from "./v2SkillsByJob";
import { V2_SKILLS, type V2SkillId } from "./v2Skills";

// 4 직군(tier-1) — 직군별 cumLevel·정복 표기 단위.
const GROUP_IDS = ["warrior", "martial", "mage", "rogue"] as const;

export type JobCodexGroup = {
  group: string;
  name: string; // 직군 대표명(기본 직업명, 예: "견습 병사")
  cumLevel: number;
  masteredAt: number; // 정복 임계(SP_MASTERED_CUMLEVEL)
  mastered: boolean;
};

export type JobCodexJob = {
  id: string;
  name: string;
  tier: number;
  group: string; // 소속 직군(전사/무인/마법사/도적)
  unlocked: boolean;
  isCurrent: boolean;
  // 그 직업의 시그니처 패시브(수집 대상). 없으면 null.
  passive: { id: string; name: string; description: string; learned: boolean } | null;
};

export type JobCodex = {
  currentJobId: string;
  groups: JobCodexGroup[];
  jobs: JobCodexJob[];
};

// 직업의 소속 직군 = 브리지의 class(전사/무인/마법사/도적). 없으면 자기 자신.
function groupOfJob(jobId: string): string {
  return LEGACY_CLASS_SPEC_BY_JOB[jobId]?.class ?? jobId;
}

// 직업의 시그니처 패시브 스킬 id(category passive). 없으면 null.
function passiveIdOfJob(jobId: string): V2SkillId | null {
  for (const id of skillsForJob(jobId)) {
    if (V2_SKILLS[id]?.category === "passive") return id;
  }
  return null;
}

export function buildJobCodex(
  prof: V2ProficiencyState,
  learnedSkillIds: readonly string[],
  cls: string,
  specChoice: string | null,
): JobCodex {
  const learned = new Set(learnedSkillIds);
  const currentJobId = jobIdFromLegacy(cls, specChoice);

  const groups: JobCodexGroup[] = GROUP_IDS.map((g) => {
    const cumLevel = groupCumLevel(prof, g);
    return {
      group: g,
      name: V2_JOB_CATALOG[g]?.name ?? g,
      cumLevel,
      masteredAt: SP_MASTERED_CUMLEVEL,
      mastered: cumLevel >= SP_MASTERED_CUMLEVEL,
    };
  });

  // 모험가(tier 0) 제외 — 실제 직업만 도감에 싣는다.
  const jobs: JobCodexJob[] = V2_JOB_LIST.filter((j) => j.tier > 0).map((job) => {
    const passiveId = passiveIdOfJob(job.id);
    const passiveDef = passiveId ? V2_SKILLS[passiveId] : null;
    return {
      id: job.id,
      name: job.name,
      tier: job.tier,
      group: groupOfJob(job.id),
      unlocked: isJobUnlocked(job, prof),
      isCurrent: job.id === currentJobId,
      passive:
        passiveId && passiveDef
          ? {
              id: passiveId,
              name: passiveDef.name,
              description: passiveDef.description,
              learned: learned.has(passiveId),
            }
          : null,
    };
  });

  return { currentJobId, groups, jobs };
}
