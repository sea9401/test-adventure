// v2 직업 패시브 — 직업 시그니처(액티브)를 상시 패시브로 대체(직업색 강화).
// docs/v2-job-passives-plan.md.
//
// passive level = 현재 직업이 속한 1차 직업군(검사/궁수/무도가/마법사/사제/인술)에서
//   **학습한 시그니처 중 최고 티어**(1~4). 전직이 다음 티어 학습을 열고, 학습해야 패시브가 오른다.
//   (학습 비용은 기존 V2_SIGNATURE_LEARN_COST 그대로 — 숙련 포인트 싱크 보존.)
//
// 이 파일은 순수 데이터 + 해석 헬퍼. derive(PR-2)가 결과를 PlayerCombat 필드에 반영한다:
//   extraAttackChancePct / accuracyPct / critMult 는 기존 필드에 가산,
//   magicAtkMultPct 는 derive 가 magicAtk ×(1+%),
//   damageTakenReductionPct / turnHealPctMaxHp / onHitDot 는 신규 PlayerCombat 패시브 필드.
//
// 수치는 전부 **미튜닝 초기값** — PR-6 sim 캘리브 대상.

import {
  type V2Class,
  V2_CLASS_DEFS,
  signatureClassOf,
  tier1ClassOf,
} from "@/adventure/data/v2/classes";
import { V2_DOT_PRESETS } from "@/adventure/data/v2/statusEffects";

// 공격 적중(피해를 입힌 턴) 시 확률로 적에게 부여하는 DoT. label·turns 는 statusEffects 프리셋과 일치,
// dmgPerTurn 은 티어별로 패시브가 따로 스케일(프리셋 기본값 대신 사용).
export type V2PassiveOnHitDot = {
  chancePct: number;
  label: string;
  dmgPerTurn: number;
  turns: number;
};

// 한 티어분 패시브 효과. 직업군마다 자기 필드만 채운다(없는 필드 = no-op).
export type V2ClassPassiveEffect = {
  /** 검사 — 평타 추가타 확률 가산(%p) → PlayerCombat.extraAttackChancePct 합산. */
  extraAttackChancePct?: number;
  /** 무도가 — 받는 피해 상시 감소(%) → PlayerCombat.passiveDamageTakenReductionPct. */
  damageTakenReductionPct?: number;
  /** 마법사 — 마법공격력 증폭(%) → derive 가 magicAtk ×(1+pct/100). */
  magicAtkMultPct?: number;
  /** 사제 — 매 플레이어 턴 maxHp 의 %만큼 회복 → PlayerCombat.passiveTurnHealPctMaxHp. */
  turnHealPctMaxHp?: number;
  /** 궁수 — 명중 가산(%p) → PlayerCombat.accuracyPct 합산. */
  accuracyPct?: number;
  /** 인술 — 크리티컬 데미지 배율 가산 → PlayerCombat.critMult 합산. */
  critMultAdd?: number;
  /** 궁/인/마 — 공격 적중 시 확률 DoT → PlayerCombat.passiveOnHitDot. */
  onHitDot?: V2PassiveOnHitDot;
};

// 해석 결과 — 직업군 + 적용 티어 + 효과.
export type V2ResolvedClassPassive = V2ClassPassiveEffect & {
  group: V2Class; // 1차 직업(swordsman/archer/…)
  tier: number; // 1~4
};

// DoT 빌더 — label·turns 는 프리셋 고정, dmgPerTurn·chancePct 만 티어별로.
function bleed(chancePct: number, dmgPerTurn: number): V2PassiveOnHitDot {
  return {
    chancePct,
    label: V2_DOT_PRESETS.출혈.label,
    dmgPerTurn,
    turns: V2_DOT_PRESETS.출혈.turns,
  };
}
function poison(chancePct: number, dmgPerTurn: number): V2PassiveOnHitDot {
  return {
    chancePct,
    label: V2_DOT_PRESETS.중독.label,
    dmgPerTurn,
    turns: V2_DOT_PRESETS.중독.turns,
  };
}
function burn(chancePct: number, dmgPerTurn: number): V2PassiveOnHitDot {
  return {
    chancePct,
    label: V2_DOT_PRESETS.소각.label,
    dmgPerTurn,
    turns: V2_DOT_PRESETS.소각.turns,
  };
}

// 직업군(1차 직업) → [T1, T2, T3, T4] 효과. 미튜닝 초기값(docs/v2-job-passives-plan.md).
type PassiveByTier = readonly [
  V2ClassPassiveEffect,
  V2ClassPassiveEffect,
  V2ClassPassiveEffect,
  V2ClassPassiveEffect,
];
export const V2_CLASS_PASSIVE: Partial<Record<V2Class, PassiveByTier>> = {
  // 검사(STR) — 평타 추가타.
  swordsman: [
    { extraAttackChancePct: 10 },
    { extraAttackChancePct: 16 },
    { extraAttackChancePct: 22 },
    { extraAttackChancePct: 30 },
  ],
  // 무도가(VIT) — 받는 피해 감소(탱).
  martial: [
    { damageTakenReductionPct: 6 },
    { damageTakenReductionPct: 9 },
    { damageTakenReductionPct: 12 },
    { damageTakenReductionPct: 16 },
  ],
  // 마법사(INT) — 마법공격력 증폭 + 소각(버스트).
  mage: [
    { magicAtkMultPct: 8, onHitDot: burn(30, 8) },
    { magicAtkMultPct: 13, onHitDot: burn(40, 11) },
    { magicAtkMultPct: 18, onHitDot: burn(50, 14) },
    { magicAtkMultPct: 25, onHitDot: burn(60, 18) },
  ],
  // 사제(SPI) — 매 턴 자가회복(지속).
  priest: [
    { turnHealPctMaxHp: 3 },
    { turnHealPctMaxHp: 4.5 },
    { turnHealPctMaxHp: 6 },
    { turnHealPctMaxHp: 8 },
  ],
  // 궁수(DEX) — 출혈 + 명중(견제).
  archer: [
    { accuracyPct: 3, onHitDot: bleed(30, 5) },
    { accuracyPct: 5, onHitDot: bleed(40, 7) },
    { accuracyPct: 7, onHitDot: bleed(50, 9) },
    { accuracyPct: 10, onHitDot: bleed(60, 12) },
  ],
  // 인술(LUK) — 크리뎀 + 중독(한방·교란).
  ninja: [
    { critMultAdd: 0.2, onHitDot: poison(30, 4) },
    { critMultAdd: 0.35, onHitDot: poison(40, 5) },
    { critMultAdd: 0.5, onHitDot: poison(50, 6) },
    { critMultAdd: 0.7, onHitDot: poison(60, 8) },
  ],
};

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
  const group = tier1ClassOf(playerClass ?? "none");
  const table = V2_CLASS_PASSIVE[group];
  if (!table) return null;
  let maxTier = 0;
  for (const id of learnedSkillIds) {
    const owner = signatureClassOf(id);
    if (!owner) continue; // 시그니처가 아니면 무시(7속성 풀 등).
    if (tier1ClassOf(owner) !== group) continue; // 다른 직업군 시그니처는 제외.
    const t = V2_CLASS_DEFS[owner].tier;
    if (t > maxTier) maxTier = t;
  }
  if (maxTier < 1) return null;
  return { group, tier: maxTier, ...table[maxTier - 1] };
}

// 패시브 효과 한 줄 설명(학습창 표기용). 채워진 필드만 " · " 로 잇는다.
export function describeClassPassiveEffect(e: V2ClassPassiveEffect): string {
  const parts: string[] = [];
  if (e.extraAttackChancePct) parts.push(`평타 추가타 +${e.extraAttackChancePct}%`);
  if (e.damageTakenReductionPct)
    parts.push(`받는 피해 -${e.damageTakenReductionPct}%`);
  if (e.magicAtkMultPct) parts.push(`마법공격력 +${e.magicAtkMultPct}%`);
  if (e.turnHealPctMaxHp) parts.push(`매 턴 HP +${e.turnHealPctMaxHp}%`);
  if (e.accuracyPct) parts.push(`명중 +${e.accuracyPct}%`);
  if (e.critMultAdd) parts.push(`치명타 피해 +${e.critMultAdd}배`);
  if (e.onHitDot)
    parts.push(`공격 시 ${e.onHitDot.chancePct}% 확률 ${e.onHitDot.label}`);
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
