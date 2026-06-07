// v2 직업 패시브 — 직업 시그니처(액티브)를 상시 패시브로 대체(직업색 강화).
// docs/v2-job-passives-plan.md.
//
// passive level = 현재 직업이 속한 1차 직업군(검사/궁수/무도가/마법사/사제/인술)에서
//   **학습한 시그니처 중 최고 티어**(1~4). 전직이 다음 티어 학습을 열고, 학습해야 패시브가 오른다.
//   (학습 비용은 기존 V2_SIGNATURE_LEARN_COST 그대로 — 숙련 포인트 싱크 보존.)
//
// 이 파일은 순수 데이터 + 해석 헬퍼. derive 가 결과를 반영한다 (2026-06-03 재설계 — 직업군당 효과 1개):
//   검사 atkPerStrCoef → atk += STR×계수,  마법사 magicAtkPerIntCoef → magicAtk += INT×계수,
//   인술 critMultAdd → critMult 가산  (이상 derive 에서 끝),
//   사제 turnHealPctMaxHp / 궁수 defPenetrationPct / 무도가 counterChancePct / 마법사 magicBasicAttack
//   은 PlayerCombat 필드로 넘겨 엔진이 적용.
//
// 수치는 전부 **미튜닝 초기값** — sim 캘리브 대상.

import { type V2Class, tier1ClassOf } from "@/adventure/data/v2/classes";

// 한 티어분 패시브 효과. 직업군마다 자기 필드 하나만 채운다(없는 필드 = no-op).
// 2026-06-03 재설계 — 직업군당 단순 효과 1개, 차수=계수업. DoT(연소/출혈/중독) 전면 제거.
export type V2ClassPassiveEffect = {
  /** 검사(STR) — 평타 공격력에 STR×계수 가산 → derive 가 atk 에 더함. */
  atkPerStrCoef?: number;
  /** 궁수(DEX) — 평타 방어 관통(%) → PlayerCombat.passiveDefPenetrationPct. */
  defPenetrationPct?: number;
  /** 무도가(VIT) — 피격 생존 시 확률 반격(%) → PlayerCombat.passiveCounterChancePct. */
  counterChancePct?: number;
  /** 사제(SPI) — 매 플레이어 턴 maxHp 의 %만큼 회복 → PlayerCombat.passiveTurnHealPctMaxHp. */
  turnHealPctMaxHp?: number;
  /** 마법사(INT) — 평타를 마법공격력 기반으로 전환 → PlayerCombat.passiveMagicBasicAttack. */
  magicBasicAttack?: true;
  /** 마법사(INT) — 마법공격력에 INT×계수 가산 → derive 가 magicAtk 에 더함. */
  magicAtkPerIntCoef?: number;
  /** 인술(LUK) — 치명타 피해 배율 가산 → PlayerCombat.critMult 합산. */
  critMultAdd?: number;
};

// 해석 결과 — 직업군 + 적용 티어 + 효과.
export type V2ResolvedClassPassive = V2ClassPassiveEffect & {
  group: V2Class; // 1차 직업(swordsman/archer/…)
  tier: number; // 1~4
};

// 직업군(1차 직업) → [T1, T2, T3, T4] 효과. 미튜닝 초기값(sim 캘리브 대상).
type PassiveByTier = readonly [
  V2ClassPassiveEffect,
  V2ClassPassiveEffect,
  V2ClassPassiveEffect,
  V2ClassPassiveEffect,
];
// P4(2026-06-04) — 구 직업 패시브 은퇴. 전문화(spec) 패시브가 대체(v2JobSpecs.ts + derive).
// 빈 맵 → resolveClassPassive 항상 null → derive 에서 inert. 타입/헬퍼는 호환 위해 보존.
export const V2_CLASS_PASSIVE: Partial<Record<V2Class, PassiveByTier>> = {};

/**
 * 현재 직업의 패시브 효과를 해석한다.
 * @param playerClass 현재 직업(어느 차수든). null/none/매핑없음이면 null.
 * @param learnedSkillIds 학습 보유 스킬 id(`skills.v2.learned`). 시그니처만 패시브 티어로 인정.
 * @returns 직업군 + 적용 티어(현 직업군 학습 시그니처 최고 티어) + 효과. 학습 시그니처 없으면 null.
 */
export function resolveClassPassive(
  playerClass: V2Class | null | undefined,
  learnedSkillIds: readonly string[],
): V2ResolvedClassPassive | null {
  // P4 — 구 직업 패시브 은퇴(전문화 패시브로 대체). V2_CLASS_PASSIVE 빈 맵 → 항상 null.
  const group = tier1ClassOf(playerClass ?? "none");
  const table = V2_CLASS_PASSIVE[group];
  if (!table) return null;
  void learnedSkillIds;
  return null;
}

// 패시브 효과 한 줄 설명(학습창 표기용). 채워진 필드만 " · " 로 잇는다.
export function describeClassPassiveEffect(e: V2ClassPassiveEffect): string {
  const parts: string[] = [];
  if (e.atkPerStrCoef) parts.push(`평타 공격력 +STR×${e.atkPerStrCoef}`);
  if (e.defPenetrationPct) parts.push(`방어 관통 ${e.defPenetrationPct}%`);
  if (e.counterChancePct)
    parts.push(`피격 시 ${e.counterChancePct}% 확률 반격`);
  if (e.turnHealPctMaxHp) parts.push(`매 턴 HP +${e.turnHealPctMaxHp}%`);
  if (e.magicBasicAttack) parts.push("평타 마법화");
  if (e.magicAtkPerIntCoef) parts.push(`마법공격력 +INT×${e.magicAtkPerIntCoef}`);
  if (e.critMultAdd) parts.push(`치명타 피해 +${e.critMultAdd}배`);
  return parts.join(" · ");
}

// 직업군 + 차수 → 그 차수의 패시브 효과 텍스트. 매핑/범위 밖이면 빈 문자열.
export function classPassiveTierText(
  playerClass: V2Class | null | undefined,
  tier: number,
): string {
  const group = tier1ClassOf(playerClass ?? "none");
  const table = V2_CLASS_PASSIVE[group];
  if (!table || !Number.isInteger(tier) || tier < 1 || tier > table.length)
    return "";
  return describeClassPassiveEffect(table[tier - 1]);
}
