import { FORTRESS_IMPACT_MAX } from "./fortressKnight";

export type DreadnoughtState = {
  counterBoostPct?: number;
  lastImpactAction?: number;
  /** PvE 기본 타격 묶음의 공통 ID. 음수는 PvE/PvP 도발 행동이며 종료 후 원래 ID로 복원한다. */
  enemyActionId?: number;
};

/** A landed impact spender heals once and can refresh, never stack, its next counter. */
export function dreadnoughtImpactSpend(input: {
  state?: DreadnoughtState;
  consumed: number;
  landed: boolean;
  maxHp: number;
  healPctPerStack?: number;
  counterBoostPct?: number;
}): { state: DreadnoughtState | undefined; heal: number } {
  const consumed = input.landed
    ? Math.max(0, Math.min(FORTRESS_IMPACT_MAX, Math.floor(input.consumed)))
    : 0;
  const boost = Math.max(0, input.counterBoostPct ?? 0);
  const state = consumed === FORTRESS_IMPACT_MAX && boost > 0
    ? {
        ...input.state,
        counterBoostPct: Math.max(input.state?.counterBoostPct ?? 0, boost),
      }
    : input.state;
  return {
    state,
    heal: Math.floor(Math.max(0, input.maxHp) * consumed * Math.max(0, input.healPctPerStack ?? 0) / 100),
  };
}

/** Only an automatic counter calls this; reflection cannot enter the resource loop. */
export function dreadnoughtCounterHit(input: {
  state?: DreadnoughtState;
  impact: number;
  gain?: number;
  actionId: number;
  landed: boolean;
}): { state: DreadnoughtState | undefined; impact: number; damageMult: number } {
  if (!input.landed) return { state: input.state, impact: input.impact, damageMult: 1 };
  const gainAmount = Math.max(0, Math.min(1, input.gain ?? 0));
  const gain = gainAmount > 0 && input.state?.lastImpactAction !== input.actionId;
  const boost = input.state?.counterBoostPct ?? 0;
  return {
    state: gain || boost > 0
      ? {
          ...input.state,
          ...(boost > 0 ? { counterBoostPct: 0 } : {}),
          ...(gain ? { lastImpactAction: input.actionId } : {}),
        }
      : input.state,
    impact: gain ? Math.min(FORTRESS_IMPACT_MAX, input.impact + gainAmount) : input.impact,
    damageMult: 1 + Math.max(0, boost) / 100,
  };
}
