// 직업 시스템 v2(V2_JOB_SYSTEM_V2) — jobId 별 효과 패시브(always-on).
// jobBonus(플랫 스탯)와 별개로, 스탯이 아닌 효과 훅(받피감·흡혈·관통·spd·중독 등)을 담는다.
// derive 가 flag-on 일 때 이 값을 V2SpecPassiveEffect 머신(specEff 경로)으로 주입 — 옛 계파
//   패시브(spec=undefined 로 억제) 대체. 직업 킷 재설계(2026-06-17).
// 기본 직업 패시브: 병사/무인/마법사 = 스탯(jobBonus 힘·활력·지능). 도적 = 예기(DEX→공격력) —
//   derive 의 직군 베이스라인(playerClass==="rogue")이라 여기엔 없음(1패시브 = 예기). 마법사도
//   마력구(평타 마법화)가 직군 베이스라인. 그래서 이 맵은 현재 비어 있다(중복 방지).
// 상위 8직업 패시브는 후속(정식 1액티브+1~2패시브 킷). 미정의 jobId = {} (효과 없음).

import type { V2SpecPassiveEffect } from "./v2JobSpecs";

export const V2_JOB_PASSIVES: Record<string, V2SpecPassiveEffect> = {
  // 현재 비어 있음 — 기본직업 패시브는 jobBonus(스탯) 또는 직군 베이스라인(예기·마력구).
  // 상위 직업 정식 킷에서 채운다.
};

/** jobId 의 효과 패시브. 미정의 = {} (효과 없음). */
export function jobPassive(jobId: string): V2SpecPassiveEffect {
  return V2_JOB_PASSIVES[jobId] ?? {};
}
