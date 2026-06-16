// 직업 시스템 v2(V2_JOB_SYSTEM_V2) — 새 jobId 별 "접근 가능 스킬셋".
// 공용(직군) + 시그니처(생존 계파) + 흡수(상위 3→2 압축에서 사라진 계파의 스킬).
//   사라진 4계파(검투사=출혈듀얼·연환=콤보·워메이지=연사·독사=중독)의 스킬을 흡수 직업에
//   편입 → 고아 스킬 재활용 + 직업 정체성 강화. 옛 (class, spec) 기반 elementalSkillsForClass
//   매핑을 대체(classes.ts 가 flag on 일 때 이 표를 jobId 로 조회).
// 차수(tier) 게이팅 없음 — 차수 폐지(직업에 들어오면 그 직업 스킬 전부 학습 대상, SP 예산이 장착 제한).

import { V2_COMMON_SKILLS_BY_JOB } from "./v2SkillsCommonCatalog";
import { V2_SPEC_SKILLS_BY_SPEC } from "./v2SkillsSpecCatalog";
import type { V2SkillId } from "./v2Skills";

const C = V2_COMMON_SKILLS_BY_JOB;
const S = V2_SPEC_SKILLS_BY_SPEC;
const join = (...groups: readonly (readonly string[])[]): readonly V2SkillId[] =>
  groups.flat() as readonly V2SkillId[];

export const V2_SKILLS_BY_JOB: Record<string, readonly V2SkillId[]> = {
  // 기본 직업 — 공용 스킬만(전직 전 단계)
  warrior: join(C.warrior),
  martial: join(C.martial),
  mage: join(C.mage),
  rogue: join(C.rogue),
  // 전사 갈래
  shieldman: join(C.warrior, S.knight),
  squire: join(C.warrior, S.gwang, S.gladiator), // 광검 + 검투사(출혈) 흡수
  // 무도가 갈래
  boxer: join(C.martial, S.gigong, S.yeonhwan), // 혈권 + 연환(콤보) 흡수
  monk: join(C.martial, S.cheolsan),
  // 마법사 갈래
  caster: join(C.mage, S.arcane, S.battlemage), // 마도사 + 워메이지(연사) 흡수
  acolyte: join(C.mage, S.cleric),
  // 도적 갈래
  assassin: join(C.rogue, S.assassin, S.venom), // 자객(크리) + 독사(중독) 흡수
  archer: join(C.rogue, S.archery),
};

/** 새 직업 id 의 접근 가능 스킬셋(공용+시그니처+흡수). 미존재 jobId = 빈 배열. */
export function skillsForJob(jobId: string): readonly V2SkillId[] {
  return V2_SKILLS_BY_JOB[jobId] ?? [];
}
