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
  type JobUnlockContext,
} from "./v2JobCatalog";
import { groupCumLevel, type V2ProficiencyState } from "./proficiency";
import { SP_MASTERED_CUMLEVEL } from "./coreLoopConfig";
import { skillsForJob } from "./v2SkillsByJob";
import { V2_SKILLS, type V2SkillId } from "./v2Skills";
import { totalCollectionSpend } from "./v2CollectionTitles";

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

export type CollectionRank = {
  // 수집 포인트 기반 등급(비파워 — 칭호/표기용). points 가 0이면 title 은 "무명".
  title: string;
  next: { title: string; at: number } | null; // 다음 등급(최고 등급이면 null)
};

export type JobCodex = {
  currentJobId: string;
  groups: JobCodexGroup[];
  jobs: JobCodexJob[];
  // 수집 포인트(A 메타 PR-2) = 수집한 직업 패시브 수(파생, 별도 저장 없음). 수백 직업까지 확장.
  //   누적(collectionPoints)은 등급 기준·불변. 사용분(spent)·잔액(available)은 소비형(PR-2b).
  collectionPoints: number; // 누적(lifetime) — 등급 기준.
  collectionPointsSpent: number; // 사용분(프리셋 슬롯 등). 누적에서 차감.
  collectionPointsAvailable: number; // 잔액 = 누적 − 사용분(소비 가능).
  rank: CollectionRank;
};

// 수집 등급 임계(오름차순) — 직업이 수백으로 늘어도 계속 도달하도록 상위 임계를 넓게 둔다.
//   순수 비파워(칭호 표기). 0점 = "무명".
const COLLECTION_TIERS: readonly { at: number; title: string }[] = [
  { at: 1, title: "직업 입문" },
  { at: 3, title: "직업 견습" },
  { at: 6, title: "직업 숙련" },
  { at: 10, title: "직업 탐험가" },
  { at: 16, title: "직업 달인" },
  { at: 24, title: "직업 대가" },
  { at: 40, title: "직업 통달자" },
  { at: 64, title: "만직의 현자" },
];

export function collectionRank(points: number): CollectionRank {
  const p = Math.max(0, Math.floor(points));
  let title = "무명";
  let next: { title: string; at: number } | null =
    COLLECTION_TIERS.length > 0
      ? { title: COLLECTION_TIERS[0].title, at: COLLECTION_TIERS[0].at }
      : null;
  for (let i = 0; i < COLLECTION_TIERS.length; i += 1) {
    if (p >= COLLECTION_TIERS[i].at) {
      title = COLLECTION_TIERS[i].title;
      const nx = COLLECTION_TIERS[i + 1];
      next = nx ? { title: nx.title, at: nx.at } : null;
    }
  }
  return { title, next };
}

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

// 누적 수집 포인트 = 수집(학습)한 직업 패시브 수. 라우트·도감 공용(파생, 별도 저장 없음).
export function countCollectedPassives(
  learnedSkillIds: readonly string[],
): number {
  const learned = new Set(learnedSkillIds);
  let n = 0;
  for (const job of V2_JOB_LIST) {
    if (job.tier <= 0) continue;
    const passiveId = passiveIdOfJob(job.id);
    if (passiveId && learned.has(passiveId)) n += 1;
  }
  return n;
}

export function buildJobCodex(
  prof: V2ProficiencyState,
  learnedSkillIds: readonly string[],
  cls: string,
  specChoice: string | null,
  loadoutPresetSlotsBought: number = 0,
  unlockCtx?: JobUnlockContext,
  ownedTitleIds: readonly string[] = [],
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
      unlocked: isJobUnlocked(job, prof, unlockCtx),
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

  // 수집 포인트 = 수집한 직업 패시브 수(파생). 거기서 등급 산출. 사용분/잔액은 소비형:
  //   프리셋 슬롯 + 수집 칭호 상점이 같은 풀을 공유(totalCollectionSpend).
  const collectionPoints = jobs.filter((j) => j.passive?.learned).length;
  const collectionPointsSpent = totalCollectionSpend(
    loadoutPresetSlotsBought,
    ownedTitleIds,
  );
  return {
    currentJobId,
    groups,
    jobs,
    collectionPoints,
    collectionPointsSpent,
    collectionPointsAvailable: Math.max(
      0,
      collectionPoints - collectionPointsSpent,
    ),
    rank: collectionRank(collectionPoints),
  };
}
