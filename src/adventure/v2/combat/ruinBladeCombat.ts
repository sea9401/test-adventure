export type RuinChargeState = {
  startHp: number;
  actualHpLost: number;
  deathBypassTriggered: boolean;
  intentAtStart: number;
};

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
}): { damagePct: number; penetrationPct: number } {
  const maxHp = Math.max(1, input.maxHp);
  const componentCap = input.pvp ? 40 : 75;
  const currentMissingPct = Math.min(
    componentCap,
    Math.max(0, ((maxHp - input.hp) / maxHp) * 100),
  );
  const chargeLossPct = input.state.deathBypassTriggered
    ? componentCap
    : Math.min(componentCap, (input.state.actualHpLost / maxHp) * 100);
  const intentPct = Math.min(3, input.state.intentAtStart) * 15;
  return {
    damagePct: Math.round((currentMissingPct + chargeLossPct + intentPct) * 100) / 100,
    penetrationPct: input.pvp ? 30 : 45,
  };
}
