import {
  V2_SKILLS,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { selectV2CastVariant } from "@/adventure/data/v2/elementalResonance";

export type FormulaState = {
  stages: number;
  seenSkillIds: readonly V2SkillId[];
};

export function formulaStagesForCast(
  skillId: V2SkillId,
  castName: string | null | undefined,
): 0 | 1 | 2 {
  const definition = V2_SKILLS[skillId];
  const directMagicIn = (
    effects: NonNullable<typeof definition>["effects"] | undefined,
  ) =>
    effects?.some(
      (effect) =>
        effect.kind === "damage" &&
        (effect.scaling === "magic" || effect.scaling === "spi"),
    ) ?? false;
  const directMagic =
    directMagicIn(definition?.effects) ||
    (definition?.castVariants ?? []).some((variant) =>
      directMagicIn(variant.effects),
    ) ||
    Object.values(definition?.elementEffects ?? {}).some((effects) =>
      directMagicIn(effects),
    );
  if (!directMagic) return 0;
  return castName?.includes("오원소 폭주") ||
    castName?.includes("오원소 회귀")
    ? 2
    : 1;
}

export function formulaCompletionOverdraftSkillIds(input: {
  state: FormulaState;
  learned: readonly V2SkillId[];
  equipped: readonly V2SkillId[];
}): V2SkillId[] {
  const learned = new Set(input.learned);
  const equipped = new Set(input.equipped);
  return input.equipped.filter((skillId) => {
    const definition = V2_SKILLS[skillId];
    if (!definition || definition.category !== "attack") return false;
    const variant = selectV2CastVariant(definition, learned, equipped);
    const stages = formulaStagesForCast(
      skillId,
      variant?.name ?? definition.name,
    );
    return previewFormulaCast({
      state: input.state,
      skillId,
      stages,
    }).completes;
  });
}

export function previewFormulaCast(input: {
  state: FormulaState;
  skillId: V2SkillId;
  stages: 0 | 1 | 2;
}): { next: FormulaState; completes: boolean } {
  if (
    input.stages === 0 ||
    input.state.seenSkillIds.includes(input.skillId)
  ) {
    return { next: input.state, completes: false };
  }
  if (input.state.stages + input.stages >= 3) {
    return { next: { stages: 0, seenSkillIds: [] }, completes: true };
  }
  return {
    next: {
      stages: input.state.stages + input.stages,
      seenSkillIds: [...input.state.seenSkillIds, input.skillId],
    },
    completes: false,
  };
}

export function optimizedMpCost(baseCost: number, reductionPct: number): number {
  const cost = Math.max(0, Math.floor(baseCost));
  if (cost === 0) return 0;
  const reduction = Math.min(100, Math.max(0, reductionPct));
  return Math.max(1, cost - Math.floor((cost * reduction) / 100));
}

export function canCastWithFormulaMana(input: {
  currentMp: number;
  normalCost: number;
  completes: boolean;
  optimizationEquipped: boolean;
}): boolean {
  return (
    input.currentMp >= input.normalCost ||
    (input.completes && input.optimizationEquipped)
  );
}
