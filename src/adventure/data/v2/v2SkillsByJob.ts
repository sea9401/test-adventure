// 직업 시스템 v2(V2_JOB_SYSTEM_V2) — jobId 별 "학습 가능 시그니처 스킬셋".
// 직업 킷 재설계(2026-06-17): 시작 스킬(자동 보유)은 공통 베이스로 두고, 직업마다 작은 킷만
//   추가한다(액티브 1 + 패시브 1~2; 패시브는 jobBonus/V2_JOB_PASSIVES). 옛 공용 풀(난격·파쇄
//   등)은 flag-on 학습 풀에서 은퇴(이미 배운 건 보존). classes.ts:elementalSkillsForClass 가
//   flag-on 일 때 이 표를 jobId 로 조회. 차수 게이팅 없음.
// 기본 4직업 = 확정 시그니처 1개. 상위 8직업 = 계파 스킬(중간안 — 정식 1액티브+패시브 킷은 후속).

import { V2_SPEC_SKILLS_BY_SPEC } from "./v2SkillsSpecCatalog";
import type { V2SkillId } from "./v2Skills";

const S = V2_SPEC_SKILLS_BY_SPEC;
const join = (...groups: readonly (readonly string[])[]): readonly V2SkillId[] =>
  groups.flat() as readonly V2SkillId[];

export const V2_SKILLS_BY_JOB: Record<string, readonly V2SkillId[]> = {
  // ── 기본 직업 — 시그니처 액티브 1개(저리턴) ──
  warrior: ["v2c_warrior_strike"], // 강타
  martial: ["v2c_martial_steelguard"], // 철포(받피감 버프)
  mage: ["v2c_mage_boltcast"], // 마력탄(0코스트 마법)
  rogue: ["v2c_rogue_poison"], // 독침(고정 중독)
  // ── 상위 직업 — 계파 스킬(중간안). 흡수한 사라진 계파 스킬 포함. 정식 킷은 후속 ──
  shieldman: join(S.knight),
  squire: join(S.gwang, S.gladiator),
  boxer: join(S.gigong, S.yeonhwan),
  monk: join(S.cheolsan),
  caster: join(S.arcane, S.battlemage),
  acolyte: join(S.cleric),
  assassin: join(S.assassin, S.venom),
  archer: join(S.archery),
};

/** 새 직업 id 의 학습 가능 시그니처 스킬셋. 미존재 jobId = 빈 배열(시작 스킬은 별도 자동 보유). */
export function skillsForJob(jobId: string): readonly V2SkillId[] {
  return V2_SKILLS_BY_JOB[jobId] ?? [];
}
