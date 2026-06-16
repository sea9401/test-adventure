// 직업 시스템 v2(V2_JOB_SYSTEM_V2) — jobId 별 효과 패시브(always-on).
// jobBonus(플랫 스탯)와 별개로, 스탯이 아닌 효과 훅(받피감·흡혈·관통·spd·중독 등)을 담는다.
// derive 가 flag-on 일 때 이 값을 V2SpecPassiveEffect 머신(specEff 경로)으로 주입 — 옛 계파
//   패시브(spec=undefined 로 억제) 대체. 직업 킷 재설계(2026-06-17).
// 기본 직업: 도적 = spd 증가(행동속도). 병사/무인/마법사 패시브는 스탯(jobBonus)이라 여기 비움.
// 상위 8직업 패시브는 후속(정식 1액티브+1~2패시브 킷). 미정의 jobId = {} (효과 없음).

import type { V2SpecPassiveEffect } from "./v2JobSpecs";

export const V2_JOB_PASSIVES: Record<string, V2SpecPassiveEffect> = {
  rogue: { spdPctAdd: 15 }, // 견습 도적 — 행동속도 +15%(다중공격이 빨라짐)
};

/** jobId 의 효과 패시브. 미정의 = {} (효과 없음). */
export function jobPassive(jobId: string): V2SpecPassiveEffect {
  return V2_JOB_PASSIVES[jobId] ?? {};
}
