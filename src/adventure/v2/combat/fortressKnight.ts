export const FORTRESS_IMPACT_MAX = 3;
export const IRON_WALL_DAMAGE_REDUCTION_PCT = 30;
export const IRON_WALL_REFLECT_DEF_PCT = 180;

export function ironWallDamageReductionPct(charges: number): number {
  return charges > 0 ? IRON_WALL_DAMAGE_REDUCTION_PCT : 0;
}

export type FortressReactionInput = {
  landed: boolean;
  defenderDef: number;
  impact: number;
  impactOnHit: boolean;
  ironWallReflectCharges: number;
};

export type FortressReactionResult = {
  impact: number;
  ironWallReflectCharges: number;
  ironWallReflected: boolean;
  rawReflectDamage: number;
};

export function resolveFortressReaction(
  input: FortressReactionInput,
): FortressReactionResult {
  const impact = Math.max(0, Math.min(FORTRESS_IMPACT_MAX, input.impact));
  const charges = Math.max(0, Math.floor(input.ironWallReflectCharges));
  if (!input.landed) {
    return {
      impact,
      ironWallReflectCharges: charges,
      ironWallReflected: false,
      rawReflectDamage: 0,
    };
  }

  const ironWallReflected = charges > 0;
  return {
    impact: input.impactOnHit
      ? Math.min(FORTRESS_IMPACT_MAX, impact + 1)
      : impact,
    ironWallReflectCharges: ironWallReflected ? charges - 1 : charges,
    ironWallReflected,
    rawReflectDamage: ironWallReflected
      ? Math.floor(
          (Math.max(0, input.defenderDef) * IRON_WALL_REFLECT_DEF_PCT) / 100,
        )
      : 0,
  };
}

export type ReactiveDefenseCharges = {
  evasion: number;
  damageReduction: number;
  reflect: number;
};

export function consumeReactiveDefenseCharges(
  charges: ReactiveDefenseCharges,
  event: {
    evasionUsed: boolean;
    landed: boolean;
    reflectEligible: boolean;
  },
): ReactiveDefenseCharges {
  const consume = (value: number, used: boolean) =>
    used ? Math.max(0, value - 1) : Math.max(0, value);
  return {
    evasion: consume(charges.evasion, event.evasionUsed),
    damageReduction: consume(charges.damageReduction, event.landed),
    reflect: consume(
      charges.reflect,
      event.landed && event.reflectEligible,
    ),
  };
}
