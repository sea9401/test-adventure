// 고유 아이템 발동형 시그니처 — 전투 엔진(PvE enemyPhase/playerPhase·PvP pvpPhase)이 공유하는
//   순수 헬퍼. docs/v2-signature-uniques-plan.md §10. 데이터는 PlayerCombat.equipSignatures
//   (derive.collectEquipSignatures 가 활성 세트/마퀴 단품에서 집계). 시그니처 없으면 전부 0/무발화
//   → 골든 byte-identical.
//
// 🔑 라이브 사냥=단일 적 1v1 → on-kill 무용(처치=전투 종료) → 전투 중 트리거만(battle_start/
//   low_hp/on_heal/on_dodge/on_action_evasion/on_crit/on_hit/on_hit_taken/on_skill_cast/
//   status_block_once/every_n_hits).
//   PR-2a = low_hp(성물) PvE+PvP. 나머지 트리거는 PR-2b.

import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";

// 저체력(low_hp) 시그니처 — 현재 HP 가 maxHp 의 임계% 이하일 때 받는 피해 −% 합산.
//   조건 미충족/미장착 = 0. 여러 개면 합산(% 합).
export function lowHpDamageReductionPct(
  signatures: SignatureEffect[] | undefined,
  currentHp: number,
  maxHp: number,
): number {
  if (!signatures || signatures.length === 0 || maxHp <= 0) return 0;
  let pct = 0;
  for (const s of signatures) {
    if (s.trigger !== "low_hp" || !s.damageTakenReductionPct) continue;
    const threshold = ((s.hpThresholdPct ?? 0) / 100) * maxHp;
    if (currentHp <= threshold) pct += s.damageTakenReductionPct;
  }
  return pct;
}

// battle_start 보호막 — 전투 시작 시 maxHp 의 %만큼 playerShield 에 더한다.
export function battleStartShield(
  signatures: SignatureEffect[] | undefined,
  maxHp: number,
): { amount: number; label: string } | null {
  if (!signatures || maxHp <= 0) return null;
  let amount = 0;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "battle_start" || !s.battleStartShieldPctMaxHp) continue;
    amount += Math.floor((maxHp * s.battleStartShieldPctMaxHp) / 100);
    labels.push(s.label);
  }
  if (amount <= 0) return null;
  return { amount, label: labels.join(" + ") };
}

export const HEAL_TO_SHIELD_MAX_PCT_MAX_HP = 30;

export type HealToShieldInput = {
  /** 최대 HP 적용 뒤 실제로 회복된 양. 0이면 치유가 성립하지 않아 발동하지 않는다. */
  actualHeal: number;
  /** 최대 HP 적용 전 산출 회복량. 회복 투자가 보호막에 보존되는 기준값. */
  calculatedHeal: number;
  maxHp: number;
};

// on_heal 보호막 전환 — 실제 치유가 발생했을 때 산출 회복량의 %만큼 playerShield 에 더한다.
// 초과 회복을 보호막으로 보존하되 한 번에 maxHp 30%까지만 허용한다.
export function healToShield(
  signatures: SignatureEffect[] | undefined,
  input: HealToShieldInput,
): { amount: number; label: string } | null {
  const actualHeal = Math.max(0, input.actualHeal);
  const calculatedHeal = Math.max(0, input.calculatedHeal);
  const maxHp = Math.max(0, input.maxHp);
  if (!signatures || actualHeal <= 0 || calculatedHeal <= 0 || maxHp <= 0) {
    return null;
  }
  let amount = 0;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_heal" || !s.healToShieldPct) continue;
    amount += Math.floor((calculatedHeal * s.healToShieldPct) / 100);
    labels.push(s.label);
  }
  amount = Math.min(
    amount,
    Math.floor((maxHp * HEAL_TO_SHIELD_MAX_PCT_MAX_HP) / 100),
  );
  if (amount <= 0) return null;
  return { amount, label: labels.join(" + ") };
}

// on_hit_taken 방어 누적(백골성벽) — 받은 HP 피해의 % 만큼 braceDefBonus 에 더할 비율.
//   실제 누적량/상한은 enemyPhase/pvpPhase 가 dmgToHp 와 기본 DEF 를 알고 계산한다.
export function onHitTakenDefGain(
  signatures: SignatureEffect[] | undefined,
): { pct: number; label: string } | null {
  if (!signatures) return null;
  let pct = 0;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_hit_taken" || !s.defGainOnHitPct) continue;
    pct += s.defGainOnHitPct;
    labels.push(s.label);
  }
  if (pct <= 0) return null;
  return { pct, label: labels.join(" + ") };
}

// status_block_once — 전투당 1회 상태이상 부여를 막을 수 있는 시그니처 라벨.
export function statusBlockOnce(
  signatures: SignatureEffect[] | undefined,
): { label: string } | null {
  if (!signatures) return null;
  const labels = signatures
    .filter((s) => s.trigger === "status_block_once" && s.statusBlockOnce)
    .map((s) => s.label);
  if (labels.length === 0) return null;
  return { label: labels.join(" + ") };
}

// on_skill_cast MP 환급 — 실제로 지불된 스킬 MP 비용의 %만큼 전투 후 MP 에 환급.
export function onSkillCastMpRefund(
  signatures: SignatureEffect[] | undefined,
): { pct: number; label: string } | null {
  if (!signatures) return null;
  let pct = 0;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_skill_cast" || !s.mpRefundPctOfCost) continue;
    pct += s.mpRefundPctOfCost;
    labels.push(s.label);
  }
  if (pct <= 0) return null;
  return { pct, label: labels.join(" + ") };
}

// on_crit 독(독니 단검) — 크리 + 피해 발생 시 부여할 독 스택 magnitude(maxHp 비율/스택). 기존
//   poison 다이얼(~0.004) 동급. 시그니처는 발동 여부만, 강도는 이 상수(밸런스 다이얼).
export const SIGNATURE_CRIT_POISON_PCT_MAX_HP_PER_STACK = 0.005;
export const SIGNATURE_HIT_POISON_PCT_MAX_HP_PER_STACK = 0.004;

// on_crit 속도 버프(군림목걸이) — 크리 + 피해 발생 시 발동할 속도 버프 {배수, 지속행동}.
//   여러 개면 가장 강한 배수. 미발동/미장착 = null.
export function onCritSpeedBuff(
  signatures: SignatureEffect[] | undefined,
  critRoll: boolean,
  dealtDamage: boolean,
): { mult: number; turns: number; label: string } | null {
  if (!critRoll || !dealtDamage || !signatures) return null;
  let best: { mult: number; turns: number; label: string } | null = null;
  for (const s of signatures) {
    if (s.trigger !== "on_crit" || !s.spdBuffPct) continue;
    const mult = 1 + s.spdBuffPct / 100;
    const turns = Math.max(1, s.buffActions ?? 1);
    if (!best || mult > best.mult) best = { mult, turns, label: s.label };
  }
  return best;
}

// on_crit 한기(동결의 갑주) — 크리 + 피해 발생 시 적에게 걸 둔화 {배수(<1), 지속행동}.
//   여러 개면 가장 강한 슬로우(가장 작은 배수). 미발동/미장착 = null. 군림(자속도+)의 거울 —
//   playerSpdMult 대신 enemySpdMult 로 적 ATB 를 늦춘다. enemySpd 슬로우 버프 슬롯 재사용(대지 마법과 동일).
export function onCritEnemyChill(
  signatures: SignatureEffect[] | undefined,
  critRoll: boolean,
  dealtDamage: boolean,
): { mult: number; turns: number } | null {
  if (!critRoll || !dealtDamage || !signatures) return null;
  let best: { mult: number; turns: number } | null = null;
  for (const s of signatures) {
    if (s.trigger !== "on_crit" || !s.chillSlowPct) continue;
    const mult = Math.max(0.1, 1 - s.chillSlowPct / 100);
    const turns = Math.max(1, s.buffActions ?? 1);
    if (!best || mult < best.mult) best = { mult, turns };
  }
  return best;
}

export function onCritEnemyDefDebuff(
  signatures: SignatureEffect[] | undefined,
  critRoll: boolean,
  dealtDamage: boolean,
): { pct: number; turns: number; label: string } | null {
  if (!critRoll || !dealtDamage || !signatures) return null;
  let best: { pct: number; turns: number; label: string } | null = null;
  for (const s of signatures) {
    if (s.trigger !== "on_crit" || !s.enemyDefDebuffPct) continue;
    const pct = Math.max(0, s.enemyDefDebuffPct);
    const turns = Math.max(1, s.buffActions ?? 1);
    if (!best || pct > best.pct) best = { pct, turns, label: s.label };
  }
  return best;
}

export function formatDefDebuffLog(
  targetName: string,
  debuff: { pct: number; turns: number; label: string },
): string {
  return `[${debuff.label}] ${targetName}에게 표식을 남겼다. (방어 ${debuff.pct}% 감소, ${debuff.turns}행동)`;
}

export function formatChillSlowLog(
  targetName: string,
  chill: { mult: number; turns: number },
): string {
  const slowPct = Math.max(0, Math.round((1 - chill.mult) * 100));
  return `[한기] ${targetName}이(가) 얼어붙어 느려진다. (속도 ${slowPct}% 감소, ${chill.turns}행동)`;
}

// on_crit 독 부여 여부(독니 단검) — 크리 + 피해 발생 시 poisonOnCrit 시그니처가 하나라도 있으면 true.
export function firesOnCritPoison(
  signatures: SignatureEffect[] | undefined,
  critRoll: boolean,
  dealtDamage: boolean,
): boolean {
  if (!critRoll || !dealtDamage || !signatures) return false;
  return signatures.some((s) => s.trigger === "on_crit" && s.poisonOnCrit);
}

export function rollOnHitPoison(
  signatures: SignatureEffect[] | undefined,
  dealtDamage: boolean,
  roll: () => number = Math.random,
): { stacks: number; label: string } | null {
  if (!dealtDamage || !signatures) return null;
  let stacks = 0;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_hit" || !s.poisonChancePct) continue;
    if (roll() * 100 >= s.poisonChancePct) continue;
    stacks += Math.max(1, s.poisonStacks ?? 1);
    labels.push(s.label);
  }
  if (stacks <= 0) return null;
  return { stacks, label: labels.join(" + ") };
}

export function rollOnHitBleed(
  signatures: SignatureEffect[] | undefined,
  dealtDamage: boolean,
  roll: () => number = Math.random,
): { stacks: number; label: string } | null {
  if (!dealtDamage || !signatures) return null;
  let stacks = 0;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_hit" || !s.bleedChancePct) continue;
    if (roll() * 100 >= s.bleedChancePct) continue;
    stacks += Math.max(1, s.bleedStacks ?? 1);
    labels.push(s.label);
  }
  if (stacks <= 0) return null;
  return { stacks, label: labels.join(" + ") };
}

export function rollOnHitShock(
  signatures: SignatureEffect[] | undefined,
  dealtDamage: boolean,
  roll: () => number = Math.random,
): { label: string } | null {
  if (!dealtDamage || !signatures) return null;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_hit" || !s.shockChancePct) continue;
    if (roll() * 100 >= s.shockChancePct) continue;
    labels.push(s.label);
  }
  if (labels.length === 0) return null;
  return { label: labels.join(" + ") };
}

export type OffensiveSignatureTriggers = {
  critSpeed: ReturnType<typeof onCritSpeedBuff>;
  critPoison: boolean;
  hitPoison: ReturnType<typeof rollOnHitPoison>;
  hitBleed: ReturnType<typeof rollOnHitBleed>;
  critChill: ReturnType<typeof onCritEnemyChill>;
  critDefDebuff: ReturnType<typeof onCritEnemyDefDebuff>;
  hitShock: ReturnType<typeof rollOnHitShock>;
};

/** 한 번의 실제 피해 공격에서 발동할 적중·치명타 장비 시그니처를 함께 판정한다. */
export function resolveOffensiveSignatureTriggers(
  signatures: SignatureEffect[] | undefined,
  input: {
    critical: boolean;
    dealtDamage: boolean;
    allowShock: boolean;
  },
  roll: () => number = Math.random,
): OffensiveSignatureTriggers {
  const critSpeed = onCritSpeedBuff(
    signatures,
    input.critical,
    input.dealtDamage,
  );
  const critPoison = firesOnCritPoison(
    signatures,
    input.critical,
    input.dealtDamage,
  );
  const hitPoison = rollOnHitPoison(signatures, input.dealtDamage, roll);
  const hitBleed = rollOnHitBleed(signatures, input.dealtDamage, roll);
  const critChill = onCritEnemyChill(
    signatures,
    input.critical,
    input.dealtDamage,
  );
  const critDefDebuff = onCritEnemyDefDebuff(
    signatures,
    input.critical,
    input.dealtDamage,
  );
  const hitShock = input.allowShock
    ? rollOnHitShock(signatures, input.dealtDamage, roll)
    : null;
  return {
    critSpeed,
    critPoison,
    hitPoison,
    hitBleed,
    critChill,
    critDefDebuff,
    hitShock,
  };
}

export function formatShockAppliedLog(
  targetName: string,
  shock: { label: string },
): string {
  return `[${shock.label}] ${targetName}의 다음 행동이 감전으로 끊긴다.`;
}

// on_action_evasion 회복 — 행동마다 현재 상대 기준 회피 경감률의 절반 확률로
// 잃은 HP 의 lostHpHealPct%를 회복한다. 여러 장비는 한 번 판정하고 회복률을 합산한다.
export function rollEvasionActionRecovery(
  signatures: SignatureEffect[] | undefined,
  currentHp: number,
  maxHp: number,
  evasionReductionPct: number,
  roll: () => number = Math.random,
): { amount: number; label: string } | null {
  if (
    !signatures ||
    maxHp <= 0 ||
    currentHp <= 0 ||
    currentHp >= maxHp ||
    evasionReductionPct <= 0
  ) {
    return null;
  }
  let lostHpHealPct = 0;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_action_evasion" || !s.lostHpHealPct) continue;
    lostHpHealPct += s.lostHpHealPct;
    labels.push(s.label);
  }
  const amount = Math.floor(
    ((maxHp - Math.max(0, currentHp)) * lostHpHealPct) / 100,
  );
  if (amount <= 0 || labels.length === 0) return null;
  const procChancePct = Math.max(0, evasionReductionPct) / 2;
  if (roll() * 100 >= procChancePct) return null;
  return { amount, label: labels.join(" + ") };
}

// every_n_hits — 평타·스킬 공용 실제 적중 주기 N(가장 작은 N = 가장 자주)과 발동 라벨.
export function everyNHitsEffect(
  signatures: SignatureEffect[] | undefined,
): { hits: number; label: string } | null {
  if (!signatures) return null;
  let best: { hits: number; label: string } | null = null;
  for (const s of signatures) {
    if (s.trigger !== "every_n_hits" || !s.everyNHits || s.everyNHits < 1) continue;
    if (!best || s.everyNHits < best.hits) {
      best = { hits: s.everyNHits, label: s.label };
    }
  }
  return best;
}

// 기존 수치 전용 호출부/테스트 호환. 0 이면 미발동.
export function everyNHitsValue(
  signatures: SignatureEffect[] | undefined,
): number {
  return everyNHitsEffect(signatures)?.hits ?? 0;
}

// on_dodge 속도 버프 — 회피 성공 시 발동할 속도 버프 {배수, 지속행동, 라벨}(가장 강한).
//   미장착/미발동 = null.
export function onDodgeSpeedBuff(
  signatures: SignatureEffect[] | undefined,
): { mult: number; turns: number; label: string } | null {
  if (!signatures) return null;
  let best: { mult: number; turns: number; label: string } | null = null;
  for (const s of signatures) {
    if (s.trigger !== "on_dodge" || !s.spdBuffPct) continue;
    const mult = 1 + s.spdBuffPct / 100;
    const turns = Math.max(1, s.buffActions ?? 1);
    if (!best || mult > best.mult) best = { mult, turns, label: s.label };
  }
  return best;
}
