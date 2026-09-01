import type { Tier7Mechanic } from "@/adventure/data/v2/tier7SkillMechanics";

export type RuinChargeState = {
  startHp: number;
  actualHpLost: number;
  deathBypassTriggered: boolean;
  intentAtStart: number;
};

export function canStartRuinCharge(
  intent: number,
  requiredStacks = 3,
): boolean {
  return (
    Math.max(0, Math.floor(intent)) ===
    Math.max(1, Math.floor(requiredStacks))
  );
}

export function gainSwordIntent(
  current: number,
  amount: number,
  maxStacks = 3,
): number {
  return Math.min(maxStacks, Math.max(0, current + Math.max(0, amount)));
}

export function startRuinCharge(input: {
  hp: number;
  intent: number;
}): RuinChargeState {
  return {
    startHp: Math.max(0, input.hp),
    actualHpLost: 0,
    deathBypassTriggered: false,
    intentAtStart: Math.max(0, input.intent),
  };
}

export function recordChargeHpLoss(
  state: RuinChargeState,
  actualHpLoss: number,
): RuinChargeState {
  return {
    ...state,
    actualHpLost: state.actualHpLost + Math.max(0, actualHpLoss),
  };
}

export function ruinSwordBonuses(input: {
  state: RuinChargeState;
  hp: number;
  maxHp: number;
  pvp: boolean;
  currentMissingHpCapPct?: number;
  chargeLostHpCapPct?: number;
  pvpCapPct?: number;
  pvpPenetrationPct?: number;
}): { damagePct: number; penetrationPct: number } {
  const maxHp = Math.max(1, input.maxHp);
  const currentMissingCap = input.pvp
    ? (input.pvpCapPct ?? 40)
    : (input.currentMissingHpCapPct ?? 75);
  const chargeLossCap = input.pvp
    ? (input.pvpCapPct ?? 40)
    : (input.chargeLostHpCapPct ?? 75);
  const currentMissingPct = Math.min(
    currentMissingCap,
    Math.max(0, ((maxHp - input.hp) / maxHp) * 100),
  );
  const chargeLossPct = input.state.deathBypassTriggered
    ? chargeLossCap
    : Math.min(chargeLossCap, (input.state.actualHpLost / maxHp) * 100);
  const intentPct = Math.min(3, input.state.intentAtStart) * 15;
  return {
    damagePct: Math.round((currentMissingPct + chargeLossPct + intentPct) * 100) / 100,
    penetrationPct: input.pvp ? (input.pvpPenetrationPct ?? 30) : 45,
  };
}

export function ruinIntentStrikeBonus(input: {
  hp: number;
  maxHp: number;
  mechanic: Tier7Mechanic | undefined;
}): number {
  const cap =
    input.mechanic?.kind === "intentStrike"
      ? input.mechanic.missingHpBonusCapPct
      : 0;
  return Math.min(
    cap,
    ((input.maxHp - input.hp) / Math.max(1, input.maxHp)) * cap,
  );
}

export function ruinSwordBonusesForMechanic(input: {
  state: RuinChargeState;
  hp: number;
  maxHp: number;
  pvp: boolean;
  mechanic: Tier7Mechanic | undefined;
}): { damagePct: number; penetrationPct: number } {
  const { mechanic, ...base } = input;
  const finisher = mechanic?.kind === "chargedFinisher" ? mechanic : undefined;
  return ruinSwordBonuses({
    ...base,
    currentMissingHpCapPct: finisher?.currentMissingHpCapPct,
    chargeLostHpCapPct: finisher?.chargeLostHpCapPct,
    pvpCapPct: finisher?.pvpCapPct,
    pvpPenetrationPct: finisher?.pvpPenetrationPct,
  });
}
