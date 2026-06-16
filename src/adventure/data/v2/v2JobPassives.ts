// 직업 시스템 v2(V2_JOB_SYSTEM_V2) — jobId 별 always-on 효과 패시브(스탯 아닌 효과 훅:
//   받피감·흡혈·관통·spd·중독 등). derive 가 flag-on 일 때 V2SpecPassiveEffect 머신(specEff
//   경로)으로 주입 — 옛 계파 패시브(spec=undefined 억제) 대체. 직업 킷 재설계(2026-06-17).
// 기본 4직업 패시브는 "패시브 스킬"(근력·강건·총명·예기 — v2SkillsByJob, 학습+SP 슬롯)로 이관됨.
//   그래서 이 맵은 현재 비어 있다. 상위 8직업 정식 킷에서 채운다(미정의 jobId = {} 효과 없음).

import type { V2SpecPassiveEffect } from "./v2JobSpecs";

export const V2_JOB_PASSIVES: Record<string, V2SpecPassiveEffect> = {
  // 비어 있음 — 기본직업 패시브는 패시브 스킬로 이관. 상위 직업 정식 킷에서 채운다.
};

/** jobId 의 효과 패시브. 미정의 = {} (효과 없음). */
export function jobPassive(jobId: string): V2SpecPassiveEffect {
  return V2_JOB_PASSIVES[jobId] ?? {};
}
