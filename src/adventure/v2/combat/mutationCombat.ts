export const MUTATION_RESOURCE_MAX = 3;

export function clampMutationResource(value: number): number {
  return Math.max(
    0,
    Math.min(MUTATION_RESOURCE_MAX, Math.floor(Number(value) || 0)),
  );
}

export function weightPhysicalSkillMultiplier(weight: number): number {
  return 1 + clampMutationResource(weight) * 0.05;
}

export function weightSpeedMultiplier(weight: number): number {
  return 1 - clampMutationResource(weight) * 0.05;
}

export function stoneskinDefMultiplier(
  weight: number,
  pctPerStack: number,
): number {
  const pct = Math.max(0, Number(pctPerStack) || 0);
  return 1 + (clampMutationResource(weight) * pct) / 100;
}

export function effectiveMutationDef(
  baseDef: number,
  weight: number,
  pctPerStack: number,
): number {
  return Math.max(
    0,
    Math.floor(
      Math.max(0, Number(baseDef) || 0) *
        stoneskinDefMultiplier(weight, pctPerStack),
    ),
  );
}

export type MutationCastTransition = {
  weightAfter: number;
  splitAfter: number;
  weightGained: number;
  weightConsumed: number;
  splitGained: number;
  splitConsumed: number;
};

export function mutationCastTransition(
  resources: { weight: number; split: number },
  action: {
    weightGain?: number;
    splitGain?: number;
    consumeWeight?: boolean;
    consumeSplit?: boolean;
  },
): MutationCastTransition {
  const weight = clampMutationResource(resources.weight);
  const split = clampMutationResource(resources.split);
  const weightConsumed = action.consumeWeight ? weight : 0;
  const splitConsumed = action.consumeSplit ? split : 0;
  const weightBeforeGain = action.consumeWeight ? 0 : weight;
  const splitBeforeGain = action.consumeSplit ? 0 : split;
  const weightAfter = clampMutationResource(
    weightBeforeGain + Math.max(0, Math.floor(action.weightGain ?? 0)),
  );
  const splitAfter = clampMutationResource(
    splitBeforeGain + Math.max(0, Math.floor(action.splitGain ?? 0)),
  );

  return {
    weightAfter,
    splitAfter,
    weightGained: weightAfter - weightBeforeGain,
    weightConsumed,
    splitGained: splitAfter - splitBeforeGain,
    splitConsumed,
  };
}

export function mutationTransitionLogLines(
  skillName: string | null,
  transition: MutationCastTransition,
): string[] {
  const lines: string[] = [];
  if (transition.weightGained > 0) {
    lines.push(
      `[중량] +${transition.weightGained} (${transition.weightAfter}/${MUTATION_RESOURCE_MAX})`,
    );
  }
  if (transition.weightConsumed > 0) {
    lines.push(
      `[${skillName ?? "중량 해방"}] 중량 ${transition.weightConsumed} 소모`,
    );
  }
  if (transition.splitGained > 0) {
    lines.push(
      `[분열] 분열체 +${transition.splitGained} (${transition.splitAfter}/${MUTATION_RESOURCE_MAX})`,
    );
  }
  if (transition.splitConsumed > 0) {
    lines.push(
      `[${skillName ?? "융합"}] 분열체 ${transition.splitConsumed} 융합`,
    );
  }
  return lines;
}
