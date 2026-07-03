// 고유 아이템 발동형 시그니처 — 전투 엔진(PvE enemyPhase/playerPhase·PvP pvpPhase)이 공유하는
//   순수 헬퍼. docs/v2-signature-uniques-plan.md §10. 데이터는 PlayerCombat.equipSignatures
//   (derive.collectEquipSignatures 가 활성 세트/마퀴 단품에서 집계). 시그니처 없으면 전부 0/무발화
//   → 골든 byte-identical.
//
// 🔑 라이브 사냥=단일 적 1v1 → on-kill 무용(처치=전투 종료) → 전투 중 트리거만(battle_start/
//   low_hp/on_heal/on_dodge/on_crit/on_hit/on_hit_taken/on_skill_cast/status_block_once/every_n_hits).
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

// on_heal 보호막 전환 — 실제 HP 회복량의 %만큼 playerShield 에 더한다.
export function healToShield(
  signatures: SignatureEffect[] | undefined,
  actualHeal: number,
): { amount: number; label: string } | null {
  if (!signatures || actualHeal <= 0) return null;
  let amount = 0;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_heal" || !s.healToShieldPct) continue;
    amount += Math.floor((actualHeal * s.healToShieldPct) / 100);
    labels.push(s.label);
  }
  if (amount <= 0) return null;
  return { amount, label: labels.join(" + ") };
}

// on_hit_taken 방어 누적(백왕좌) — 받은 HP 피해의 % 만큼 braceDefBonus 에 더할 비율.
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
): { mult: number; turns: number } | null {
  if (!critRoll || !dealtDamage || !signatures) return null;
  let best: { mult: number; turns: number } | null = null;
  for (const s of signatures) {
    if (s.trigger !== "on_crit" || !s.spdBuffPct) continue;
    const mult = 1 + s.spdBuffPct / 100;
    const turns = Math.max(1, s.buffActions ?? 1);
    if (!best || mult > best.mult) best = { mult, turns };
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

export function formatChillSlowLog(
  targetName: string,
  chill: { mult: number; turns: number },
): string {
  const slowPct = Math.max(0, Math.round((1 - chill.mult) * 100));
  return `[한기] ${targetName}이(가) 얼어붙어 느려진다. (속도 ${slowPct}% 감소, ${chill.turns}턴)`;
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

export function rollOnHitShock(
  signatures: SignatureEffect[] | undefined,
  dealtDamage: boolean,
  roll: () => number = Math.random,
): { mult: number; turns: number; label: string } | null {
  if (!dealtDamage || !signatures) return null;
  let best: { mult: number; turns: number } | null = null;
  const labels: string[] = [];
  for (const s of signatures) {
    if (s.trigger !== "on_hit" || !s.shockChancePct || !s.shockSlowPct) continue;
    if (roll() * 100 >= s.shockChancePct) continue;
    const mult = Math.max(0.1, 1 - s.shockSlowPct / 100);
    const turns = Math.max(1, s.buffActions ?? 1);
    labels.push(s.label);
    if (!best || mult < best.mult) best = { mult, turns };
  }
  if (!best) return null;
  return { ...best, label: labels.join(" + ") };
}

export function formatShockSlowLog(
  targetName: string,
  shock: { mult: number; turns: number; label: string },
): string {
  const slowPct = Math.max(0, Math.round((1 - shock.mult) * 100));
  return `[${shock.label}] ${targetName}이(가) 감전되어 움직임이 끊긴다. (속도 ${slowPct}% 감소, ${shock.turns}턴)`;
}

// on_dodge 회복(봉인된 반지) — 회피 성공 시 maxHp 의 healPct% 회복량 합산. 없으면 0.
export function onDodgeHealAmount(
  signatures: SignatureEffect[] | undefined,
  maxHp: number,
): number {
  if (!signatures || maxHp <= 0) return 0;
  let amt = 0;
  for (const s of signatures) {
    if (s.trigger !== "on_dodge" || !s.healPct) continue;
    amt += Math.floor((s.healPct / 100) * maxHp);
  }
  return amt;
}

// every_n_hits(포식자 세트) — 추가타 주기 N(가장 작은 N = 가장 자주). 없으면 0.
//   "N타마다 추가타 1회". 0 이면 미발동.
export function everyNHitsValue(
  signatures: SignatureEffect[] | undefined,
): number {
  if (!signatures) return 0;
  let best = 0;
  for (const s of signatures) {
    if (s.trigger !== "every_n_hits" || !s.everyNHits || s.everyNHits < 1) continue;
    if (best === 0 || s.everyNHits < best) best = s.everyNHits;
  }
  return best;
}

// on_dodge 속도 버프(독왕 세트) — 회피 성공 시 발동할 속도 버프 {배수, 지속행동}(가장 강한).
//   미장착/미발동 = null.
export function onDodgeSpeedBuff(
  signatures: SignatureEffect[] | undefined,
): { mult: number; turns: number } | null {
  if (!signatures) return null;
  let best: { mult: number; turns: number } | null = null;
  for (const s of signatures) {
    if (s.trigger !== "on_dodge" || !s.spdBuffPct) continue;
    const mult = 1 + s.spdBuffPct / 100;
    const turns = Math.max(1, s.buffActions ?? 1);
    if (!best || mult > best.mult) best = { mult, turns };
  }
  return best;
}
