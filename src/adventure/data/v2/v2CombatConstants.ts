// v2 전투 상수 — character/skills.ts 에서 v2 전투가 실제로 쓰는 스칼라만 이관(2026-06-04).
// v1 25스킬 카탈로그는 v2 전투에서 미사용(死) → skills.ts 는 Stage 4 에서 삭제 예정.
// 여기 값들은 skills.ts 에서 verbatim 복사 — 동작 불변(골든 마스터 가드).

// 일반 공격과 직접 피해 스킬은 기본적으로 빗나가지 않는다. 완전 회피는 보장 회피처럼
// 명시된 기믹만 담당하고, 일반 회피도는 아래의 직접 피해 경감으로 작동한다.
export const V2_BASE_MISS_PCT = 0;

// 회피도와 적중도를 겨뤄 직접 피해 경감률을 계산한다.
// 경감률 = 85% × 회피도 / (회피도 + 적중도 × 대항 계수).
// 85%는 하드캡이 아니라 도달하지 않는 점근 상한이다.
export const EVASION_DAMAGE_REDUCTION_MAX_PCT = 85;
export const EVASION_CONTEST_K = 2.5;
export const PVP_DODGE_K = 3;
export const PVE_DODGE_K = 2.5;
// 이전 이름을 참조하는 시뮬레이션·표시 코드의 단계적 이행용 별칭.
export const DODGE_MAX = EVASION_DAMAGE_REDUCTION_MAX_PCT;
export const DODGE_K = EVASION_CONTEST_K;

// 마나 실드 패시브의 INT·최대 MP 생존축. 현재 MP를 소모하지 않으며 전투 시작 시
// 내구도·흡수율·내구도 경감률을 한 번만 결정한다.
export const MAGIC_BARRIER_BASE_INT = 15;
export const MAGIC_BARRIER_MAX_MP_PCT = 60;
export const MAGIC_BARRIER_DURABILITY_PER_INT = 2;
export const MAGIC_BARRIER_ABSORB_SCALE = 250;
export const MAGIC_BARRIER_EFFICIENCY_SCALE = 1_500;
export const MAGIC_BARRIER_PVE_MAX_ABSORB_PCT = 45;
export const MAGIC_BARRIER_PVP_MAX_ABSORB_PCT = 30;
export const MAGIC_BARRIER_PVE_MAX_EFFICIENCY_PCT = 30;
export const MAGIC_BARRIER_PVP_MAX_EFFICIENCY_PCT = 20;

// 적→플레이어 물리 피격 방어 점감식. 전투 엔진과 UI가 같은 수치로 설명하도록
// 가벼운 공용 상수 파일에 둔다. 85%는 도달하지 않는 점근 상한이며 피해 하한도 15%다.
export const PHYSICAL_DEF_MITIGATION_MAX_PCT = 85;
export const PHYSICAL_DEF_MITIGATION_SCALE = 500;

export function physicalDefenseDamageReductionPct(defense: number): number {
  const value = Math.max(0, defense);
  return value > 0
    ? (PHYSICAL_DEF_MITIGATION_MAX_PCT * value) /
        (value + PHYSICAL_DEF_MITIGATION_SCALE)
    : 0;
}

// 마법 방어는 적 공격력과 대결하는 기존 비율식을 유지한다. 표시에서는 실제 전투의
// 최소 피해 15%까지 반영해 현재 상대 기준 경감률을 계산한다.
export const MAGIC_DEF_MITIGATION_K = 3;
export function magicDefenseDamageReductionPct(
  incomingAttack: number,
  magicDefense: number,
): number {
  const attack = Math.max(0, incomingAttack);
  const defense = Math.max(0, magicDefense);
  if (attack <= 0 || defense <= 0) return 0;
  return Math.min(
    PHYSICAL_DEF_MITIGATION_MAX_PCT,
    (100 * MAGIC_DEF_MITIGATION_K * defense) /
      (attack + MAGIC_DEF_MITIGATION_K * defense),
  );
}

export type MagicBarrierStats = {
  maxDurability: number;
  pveAbsorbPct: number;
  pvpAbsorbPct: number;
  pveEfficiencyPct: number;
  pvpEfficiencyPct: number;
};

export function magicBarrierStats(intStat: number, maxMp: number): MagicBarrierStats {
  const effectiveInt = Math.max(0, Math.floor(intStat) - MAGIC_BARRIER_BASE_INT);
  if (effectiveInt <= 0 || maxMp <= 0) {
    return {
      maxDurability: 0,
      pveAbsorbPct: 0,
      pvpAbsorbPct: 0,
      pveEfficiencyPct: 0,
      pvpEfficiencyPct: 0,
    };
  }
  const maxDurability = Math.max(
    1,
    Math.floor(
      (maxMp * MAGIC_BARRIER_MAX_MP_PCT) / 100 +
        effectiveInt * MAGIC_BARRIER_DURABILITY_PER_INT,
    ),
  );
  const absorbRatio = effectiveInt / (effectiveInt + MAGIC_BARRIER_ABSORB_SCALE);
  const efficiencyRatio =
    maxDurability / (maxDurability + MAGIC_BARRIER_EFFICIENCY_SCALE);
  return {
    maxDurability,
    pveAbsorbPct: MAGIC_BARRIER_PVE_MAX_ABSORB_PCT * absorbRatio,
    pvpAbsorbPct: MAGIC_BARRIER_PVP_MAX_ABSORB_PCT * absorbRatio,
    pveEfficiencyPct:
      MAGIC_BARRIER_PVE_MAX_EFFICIENCY_PCT * efficiencyRatio,
    pvpEfficiencyPct:
      MAGIC_BARRIER_PVP_MAX_EFFICIENCY_PCT * efficiencyRatio,
  };
}

export type MagicBarrierPartition = {
  bodyRawDamage: number;
  absorbedDamage: number;
  spillDamage: number;
  durabilitySpent: number;
  durabilityLeft: number;
  destroyed: boolean;
};

export function partitionWithMagicBarrier(
  rawDamage: number,
  durability: number,
  absorbPct: number,
  efficiencyPct: number,
): MagicBarrierPartition {
  const incoming = Number.isFinite(rawDamage)
    ? Math.max(0, Math.floor(rawDamage))
    : 0;
  const available = Number.isFinite(durability)
    ? Math.max(0, Math.floor(durability))
    : 0;
  const safeAbsorbPct = Number.isFinite(absorbPct)
    ? Math.min(100, Math.max(0, absorbPct))
    : 0;
  const safeEfficiencyPct = Number.isFinite(efficiencyPct)
    ? Math.min(100, Math.max(0, efficiencyPct))
    : 0;
  const targetShielded = Math.floor((incoming * safeAbsorbPct) / 100);

  if (incoming <= 0 || available <= 0 || targetShielded <= 0) {
    return {
      bodyRawDamage: incoming,
      absorbedDamage: 0,
      spillDamage: 0,
      durabilitySpent: 0,
      durabilityLeft: available,
      destroyed: false,
    };
  }

  const bodyRawDamage = incoming - targetShielded;
  const costRatio = 1 - safeEfficiencyPct / 100;
  const fullCost = Math.ceil(targetShielded * costRatio);
  if (fullCost <= available) {
    const durabilityLeft = available - fullCost;
    return {
      bodyRawDamage,
      absorbedDamage: targetShielded,
      spillDamage: 0,
      durabilitySpent: fullCost,
      durabilityLeft,
      destroyed: durabilityLeft === 0,
    };
  }

  const affordableDamage =
    costRatio <= 0
      ? targetShielded
      : Math.min(targetShielded, Math.floor(available / costRatio));
  const durabilitySpent = Math.min(
    available,
    Math.ceil(affordableDamage * costRatio),
  );
  return {
    bodyRawDamage,
    absorbedDamage: affordableDamage,
    spillDamage: targetShielded - affordableDamage,
    durabilitySpent,
    durabilityLeft: 0,
    destroyed: true,
  };
}

function evasionDamageReductionWithK(
  evaRating: number,
  accRating: number,
  contestK: number,
): number {
  const e = Math.max(0, evaRating);
  if (e <= 0) return 0;
  return (
    (EVASION_DAMAGE_REDUCTION_MAX_PCT * e) /
    (e + Math.max(0, accRating) * contestK)
  );
}

/** PvE에서 방어자의 회피도가 공격자의 적중도에 맞서 줄이는 직접 피해 비율. */
export function evasionDamageReductionPct(
  evaRating: number,
  accRating: number,
): number {
  return evasionDamageReductionWithK(evaRating, accRating, EVASION_CONTEST_K);
}

/** PvP에서 방어자의 회피도가 줄이는 직접 피해 비율. */
export function pvpEvasionDamageReductionPct(
  evaRating: number,
  accRating: number,
): number {
  return evasionDamageReductionWithK(evaRating, accRating, PVP_DODGE_K);
}

/** PvE 피격에서 플레이어 회피도가 줄이는 직접 피해 비율. */
export function pveEvasionDamageReductionPct(
  evaRating: number,
  accRating: number,
): number {
  return evasionDamageReductionWithK(evaRating, accRating, PVE_DODGE_K);
}

/** 경감률을 정수 직접 피해에 적용한다. 양수 피해는 최소 1을 남긴다. */
export function applyEvasionDamageReduction(
  damage: number,
  reductionPct: number,
): number {
  if (damage <= 0) return 0;
  if (reductionPct <= 0) return damage;
  return Math.max(
    1,
    Math.floor(damage * (1 - Math.min(EVASION_DAMAGE_REDUCTION_MAX_PCT, reductionPct) / 100)),
  );
}

/** @deprecated 일반 회피도는 더 이상 완전 회피 확률을 만들지 않는다. */
export function attackMissPct(): number {
  return 0;
}

/** @deprecated 일반 회피도는 더 이상 PvP 완전 회피 확률을 만들지 않는다. */
export function pvpAttackMissPct(): number {
  return 0;
}

/** @deprecated 회피 확률이 아니라 피해 경감률이다. */
export function dodgeChance(evaRating: number, accRating: number): number {
  return evasionDamageReductionPct(evaRating, accRating);
}

/** @deprecated 회피 확률이 아니라 PvP 피해 경감률이다. */
export function pvpDodgeChance(evaRating: number, accRating: number): number {
  return pvpEvasionDamageReductionPct(evaRating, accRating);
}

/** @deprecated 회피 확률이 아니라 PvE 피해 경감률이다. */
export function pveDodgeChance(evaRating: number, accRating: number): number {
  return pveEvasionDamageReductionPct(evaRating, accRating);
}

export const POWER_ATTACK_TURN_INTERVAL = 3;
// 치명타 기본 배수 — 모든 크리가 받는 바닥값. 2.0→1.4 하향(2026-06-08): ×2 base 는 무투자
//   크리도 이미 큰 한방이라 크리가 지배적·스윙적(자동전투 원샷 압박)이었다. 1.4 로 낮춰 "무투자
//   크리=스파이크, 큰 크리=LUK 투자 보상"으로 교정. LUK 보전 위해 CRIT_DMG_PER_LUK 0.006→0.007
//   동반(derivePlayerCombatV2). (2026-06-21 PR-2: critMult 하드캡 5.0 폐기 → 점감 곡선 critMultCurve.)
export const CRIT_MULT_BASE = 1.4;
// 스킬(액티브) 치명타 배수 — 평타와 같은 크리 확률(min(critChancePct, CRIT_PCT_CAP))을 공유하되,
// 곱해지는 배수는 평타 critMult(점감 곡선 1.4~2.6×)와 분리한 별도 고정 다이얼. 스킬은 계수·발동이 평타보다
// 커서 평타 배수를 그대로 곱하면 폭주 → flat 으로 제한한다. 2026-08-05: 후반 평타 치명타 대비
// 액티브 스킬이 약해지는 격차를 줄이기 위해 1.5→1.7 상향. 크리캡 75% 기준 평균 스킬 피해 기여는
// 최대 +52.5%(관련 패시브의 오버플로 적용 전)다.
export const SKILL_CRIT_MULT = 1.7;
export const BLEED_MAX_STACKS = 10;
export const POISON_MAX_STACKS = 10;
// 약점 노출(마도사) 마법취약 / 주문 중첩(워메이지) 누적 상한 — 무한 인플레 방지. PvE/PvP 공용.
export const MAGIC_VULN_STACK_CAP = 10;
export const SPELL_STACK_CAP = 10;
export const PLAYER_BLEED_ATK_COEF_PER_STACK = 0.25;
export const MONSTER_BLEED_ATK_COEF_PER_STACK = 0.12;
export const POISON_PCT_PER_POINT = 0.0005;
// 절초 — 누적 적중 N타째마다 마무리 강타. 구조적 주기(위력은 데이터 comboFinisherBonusPct).
// engine.ts 에서 이관(2026-06-12).
export const COMBO_FINISHER_PERIOD = 4;
export const POISON_CAP_ATK_COEF = 0.9;
// 맹독 I~IV + 만독지배의 완성 세팅(+122.4%)을 중독 최종 피해의 기준점으로 삼는다.
// 고체력 대상에서도 이 기준 피해는 기존과 같고, 실제 패시브 배율은 최종 피해에 선형 적용된다.
export const POISON_FULL_BUILD_DAMAGE_MULT = 2.224;
// 일반 보스는 기존 80%를 유지하고, 공유 체력을 가진 협동 보스만 더 강하게 감산한다.
export const COOP_BOSS_MAX_HP_DAMAGE_MULT = 0.5;

// 여러 방어 감소 효과는 남은 방어력에 차례로 적용한다.
// 예: 20%와 30%를 함께 쓰면 50%가 아니라 44%(남은 방어 0.8×0.7=0.56).
// 각 입력은 0~100%로 방어적으로 제한하며 결과는 절대 100%를 넘지 않는다.
export function combineDefReductionPcts(...values: number[]): number {
  let remaining = 1;
  for (const raw of values) {
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const pct = Math.min(100, raw);
    remaining *= 1 - pct / 100;
  }
  return Math.round((1 - remaining) * 100 * 1_000_000) / 1_000_000;
}
export const DEF_REDUCTION_PCT_CAP = 60;
export function cappedDefReductionPct(...values: number[]): number {
  return Math.min(DEF_REDUCTION_PCT_CAP, combineDefReductionPcts(...values));
}
export const HEAVEN_DECREE_HP_PCT = 5;
export const RAMPAGE_START_TURN = 3;
export const ANALYSIS_PENALTY_CAP_PCT = 0.3;
export const GALE_CHAIN_MAX_PER_TURN = 3;
export const LUCKY_STAR_DAMAGE_MULT = 2;
export const IMPACT_WAVE_INTERVAL = 3;
export const ETERNAL_GALE_ABSOLUTE_CAP = 30;
