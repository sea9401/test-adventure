// 직업 시스템 v2 — jobId 별 "학습 가능 시그니처 스킬셋".
// 직업 킷 재설계(2026-06-17): 시작 스킬(자동 보유)은 공통 베이스로 두고, 직업마다 작은 킷만
//   추가한다(액티브 1 + 패시브 1). 옛 공용 풀(난격·파쇄 등)·계파 스킬은 flag-on 학습 풀에서
//   은퇴(이미 배운 건 보존). classes.ts:elementalSkillsForClass 가 flag-on 일 때 이 표를 jobId
//   로 조회. 차수 게이팅 없음.
// 상위 8직업 패시브는 모두 서로 다른 축(고유) — 다른 직업을 순회해 다른 패시브를 모으는 메리트.

import type { V2SkillId } from "./v2Skills";

export const V2_SKILLS_BY_JOB: Record<string, readonly V2SkillId[]> = {
  // ── 기본 4직업 — 액티브 1 + 패시브 스킬 1(학습+SP 슬롯해야 효과) ──
  warrior: ["v2c_warrior_strike", "v2c_warrior_might"], // 강타 + 근력(힘+10)
  martial: ["v2c_martial_steelguard", "v2c_martial_fortitude"], // 철포 + 강건(활력+10)
  mage: ["v2c_mage_boltcast", "v2c_mage_acumen"], // 마력탄 + 총명(지능+10)
  rogue: ["v2c_rogue_poison", "v2c_rogue_finesse"], // 독침 + 예기(민첩→공격력)
  // ── 상위 8직업 — 액티브 1 + 고유 % 패시브 1(직업마다 다른 축) ──
  shieldman: ["v2c_shieldman_bash", "v2c_shieldman_vitality"], // 방패 타격 + 체력(HP+12%)
  squire: ["v2c_squire_cleave", "v2c_squire_might"], // 베기 + 근력 II(힘+15%)
  boxer: ["v2c_boxer_combo", "v2c_boxer_fortitude"], // 연권 + 강건 II(활력+15%)
  monk: ["v2c_monk_palm", "v2c_monk_spirit"], // 장권 + 정신(정신+15%)
  caster: ["v2c_caster_bolt", "v2c_caster_acumen"], // 마탄 + 총명 II(지능+15%)
  acolyte: ["v2c_acolyte_smite", "v2c_acolyte_mana"], // 성광 + 마나(MP+12%)
  assassin: ["v2c_assassin_ambush", "v2c_assassin_fortune"], // 기습 + 행운(행운+10%)
  archer: ["v2c_archer_volley", "v2c_archer_agility"], // 난사 + 민첩(민첩+10%)
};

/** 새 직업 id 의 학습 가능 시그니처 스킬셋. 미존재 jobId = 빈 배열(시작 스킬은 별도 자동 보유). */
export function skillsForJob(jobId: string): readonly V2SkillId[] {
  return V2_SKILLS_BY_JOB[jobId] ?? [];
}
