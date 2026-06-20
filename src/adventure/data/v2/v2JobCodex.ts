// 직업 도감 — 읽기 전용 대시보드 데이터 빌더(순수). 직업 해금/스킬 수집 현황을 평면 목록으로
//   모은다. 엔드포인트(api/v2/me/job-codex)와 dev 하네스가 공유. 파워 무관.
//
// 🔑 직군(계열) 묶음·정복 표기, 수집 포인트/등급 칭호는 도감에서 폐기(오너 요청 — 불필요한 복잡도).
//   정복(직군 cumLevel) 메커니즘(3차 해금·SP 보너스)은 calcSpBudget/isJobUnlocked 에 그대로 살아
//   있고(도감 표시만 제거), 해금 조건은 전직 화면에서 확인한다. 도감은 직업 목록 + 스킬 수집만.

import {
  V2_JOB_LIST,
  isJobUnlocked,
  jobIdFromLegacy,
  jobUnlockConditionText,
  type JobUnlockContext,
} from "./v2JobCatalog";
import { type V2ProficiencyState } from "./proficiency";
import { skillsForJob } from "./v2SkillsByJob";

export type JobCodexJob = {
  id: string;
  name: string;
  unlocked: boolean;
  isCurrent: boolean;
  // 해금 조건 텍스트(전직 화면과 동일 헬퍼). 도감은 해금된 직업만 싣고, 어떤 조건으로 열렸는지 표기.
  condition: string;
  // 스킬 수집 현황 — 그 직업의 시그니처 스킬(액티브+패시브) 중 학습한 개수 / 전체. 둘 다 배우면
  //   skillsLearned === skillsTotal = "수집 완료". UI 는 이 진행도만 표기(차수·패시브 정체 비공개).
  skillsLearned: number;
  skillsTotal: number;
};

export type JobCodex = {
  currentJobId: string;
  // 해금된 직업만(잠긴 직업 제외). 진행도 "해금 N/M" 의 분자.
  jobs: JobCodexJob[];
  // 전체 실제 직업 수(tier>0) — "해금 N/M" 의 분모(목록엔 해금분만 실려도 진척 표기 유지).
  totalJobs: number;
};

export function buildJobCodex(
  prof: V2ProficiencyState,
  learnedSkillIds: readonly string[],
  cls: string,
  specChoice: string | null,
  unlockCtx?: JobUnlockContext,
): JobCodex {
  const learned = new Set(learnedSkillIds);
  const currentJobId = jobIdFromLegacy(cls, specChoice);

  // 모험가(tier 0) 제외 + 해금된 직업만 — 잠긴(미해금) 직업은 도감에 안 싣는다(오너 요청).
  const realJobs = V2_JOB_LIST.filter((j) => j.tier > 0);
  const jobs: JobCodexJob[] = realJobs
    .filter((j) => isJobUnlocked(j, prof, unlockCtx))
    .map((job) => {
    // 스킬 수집 진행도 — 시그니처 스킬(액티브+패시브) 중 학습한 수.
    const signature = skillsForJob(job.id);
    return {
      id: job.id,
      name: job.name,
      unlocked: true, // 필터로 해금된 것만 통과.
      isCurrent: job.id === currentJobId,
      condition: jobUnlockConditionText(job),
      skillsTotal: signature.length,
      skillsLearned: signature.filter((id) => learned.has(id)).length,
    };
  });

  return { currentJobId, jobs, totalJobs: realJobs.length };
}
