// PvE(engine.playerPhase computeAttackDamage)와 PvP(engine.pvpPhase computeAttackDamagePvP)에서
// 표현식·순서가 1:1 동일했던 "순수 수학" 평타 데미지 조각만 단일화한다. 입력은 전부 primitive
// (number/boolean)라 양 엔진의 state/side 접근 차이와 무관 — 동작 불변(골든 PvE·PvP 매트릭스 가드 +
// damageHelpers.test.ts 가 인라인 수식과 직접 대조). 캐스케이드 전체는 구조적으로 발산하므로
// (hp 의미 max/current·vuln 적용범위·PvE 전용 레이어 등) 통합하지 않는다 — 이 6개만 공유.

import {
  CRIT_OVERFLOW_DMG_CAP,
  CRIT_OVERFLOW_DMG_PER_PCT,
  CRIT_PCT_CAP,
} from "@/adventure/data/stats";
import { extractApEffect } from "./combatShared";
import { DEF_IGNORE_FRACTION } from "./engine";

// 분쇄 — 강공격 발동 턴이면서 분쇄 보유 시 적 DEF 고정 감산(0 하한). 아니면 baseDef 그대로.
export function computeAfterCrush(
  baseDef: number,
  attackBonus: number,
  crushReduction: number,
): number {
  return attackBonus > 0 && crushReduction > 0
    ? Math.max(0, baseDef - crushReduction)
    : baseDef;
}

// 암살/약점/AP 방어 관통 — 완전 무시가 아니라 DEF_IGNORE_FRACTION(30%)만 곱연산 무시.
export function applyDefIgnore(afterCrushDef: number, shouldIgnore: boolean): number {
  return shouldIgnore
    ? Math.round(afterCrushDef * (1 - DEF_IGNORE_FRACTION))
    : afterCrushDef;
}

// 광전사(특기) — 잃은 HP 비율만큼 ATK 가산. pct 미보유/0 이면 0.
export function computeBerserkBonus(
  atk: number,
  currentHp: number,
  maxHp: number,
  pctPerLostHpPct: number | undefined,
): number {
  const pct = pctPerLostHpPct ?? 0;
  if (!(pct > 0)) return 0;
  const lostHpFraction = Math.max(0, 1 - currentHp / maxHp);
  return Math.floor(atk * lostHpFraction * pct);
}

// 천칭 — 공격자 SPD 가 빠른 만큼(차이) 크리 확률 가산(%p). pct 미보유/0 이면 0.
export function computeBalanceCritBonus(
  atkSpd: number,
  defSpd: number,
  pctPerSpdDiff: number | undefined,
): number {
  const pct = pctPerSpdDiff ?? 0;
  if (!(pct > 0)) return 0;
  return Math.floor(Math.max(0, atkSpd - defSpd) * pct);
}

// 크리 확률 CRIT_PCT_CAP 초과분 → 크리뎀 보너스로 변환(상한 CRIT_OVERFLOW_DMG_CAP).
export function computeCritOverflowBonus(rawCritPct: number): number {
  return Math.min(
    CRIT_OVERFLOW_DMG_CAP,
    Math.max(0, rawCritPct - CRIT_PCT_CAP) * CRIT_OVERFLOW_DMG_PER_PCT,
  );
}

// 폭풍 일격(AP) — fire 시 atk × spdPct/100 추가 고정 피해(targetDef 무시). 아니면 0.
export function computeStormBonus(
  atk: number,
  apMultEffect: Parameters<typeof extractApEffect>[0],
): number {
  return apMultEffect?.kind === "atk_plus_spd_pct_bonus"
    ? Math.floor((atk * apMultEffect.spdPct) / 100)
    : 0;
}
