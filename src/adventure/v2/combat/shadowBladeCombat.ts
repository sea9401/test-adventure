import type { V2SkillId } from "@/adventure/data/v2/v2Skills";

export type SwordShadowState = {
  sourceSkillId: V2SkillId;
  sourceFinalDamage: number;
  recordPct: number;
  refined: boolean;
};

function shadowDamage(state: SwordShadowState): number {
  return (state.sourceFinalDamage * state.recordPct) / 100;
}

export function recordSwordShadow(input: {
  existing?: SwordShadowState;
  sourceSkillId: V2SkillId;
  dealtDamage: number;
  recordPct: number;
  pvpScalePct?: number;
}): SwordShadowState | undefined {
  if (input.dealtDamage <= 0 || input.recordPct <= 0) return input.existing;
  const candidate: SwordShadowState = {
    sourceSkillId: input.sourceSkillId,
    sourceFinalDamage: input.dealtDamage,
    recordPct: input.recordPct * ((input.pvpScalePct ?? 100) / 100),
    refined: false,
  };
  return !input.existing || shadowDamage(candidate) > shadowDamage(input.existing)
    ? candidate
    : input.existing;
}

export function refineSwordShadow(
  state: SwordShadowState | undefined,
  addPctPoints: number,
): SwordShadowState | undefined {
  if (!state || state.refined || addPctPoints <= 0) return state;
  return {
    ...state,
    recordPct: state.recordPct + addPctPoints,
    refined: true,
  };
}

export function releaseSwordShadow(
  state: SwordShadowState | undefined,
  input: { nextSingleDamagePct: number },
): { damage: number; followUpPct: number } {
  if (!state) return { damage: 0, followUpPct: 0 };
  return {
    damage: Math.round(shadowDamage(state)),
    followUpPct: input.nextSingleDamagePct,
  };
}

export function consumeShadowFollowUp(input: {
  pendingPct: number;
  isSinglePhysical: boolean;
  hit: boolean;
  damage: number;
}): { damage: number; pendingPct: number } {
  if (!input.isSinglePhysical || input.pendingPct <= 0) {
    return { damage: input.damage, pendingPct: input.pendingPct };
  }
  return {
    damage: input.hit
      ? Math.round(input.damage * (1 + input.pendingPct / 100))
      : input.damage,
    pendingPct: 0,
  };
}
