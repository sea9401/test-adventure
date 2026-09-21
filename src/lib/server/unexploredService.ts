import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { unexploredEncounterShares } from "@/adventure/data/v2/unexploredEncounters";
import {
  deriveUnexploredEffects,
  unexploredActivationError,
  unexploredActivationPath,
  unexploredRefundError,
  unexploredRefundPath,
} from "@/adventure/data/v2/unexploredTree";
import {
  canChangeUnexploredNodes,
  isUnexploredPresetIndex,
  parseUnexploredSave,
  unexploredEarnedPoints,
  type UnexploredSave,
  type UnexploredPresetIndex,
} from "@/adventure/data/v2/unexploredState";
import {
  explorationPointCost,
  grantUnexploredAchievements,
  unexploredAchievementCandidates,
} from "@/adventure/data/v2/unexploredProgression";

export const UNEXPLORED_REFUND_GOLD_COST = 500_000;

export type UnexploredCharacterSave = {
  level?: number;
  gold?: number;
  bankedGold?: number;
  materials?: unknown;
  unexplored?: unknown;
  [key: string]: unknown;
};

export type UnexploredMutation = (
  | { action: "activate"; nodeId: string }
  | { action: "activate_path"; nodeId: string }
  | { action: "refund"; nodeId: string }
  | { action: "refund_path"; nodeId: string }
  | { action: "reset" }
  | { action: "switch_preset"; presetIndex: UnexploredPresetIndex }
) & { expectedPresetIndex?: UnexploredPresetIndex };

export type UnexploredMutationError =
  | "level_required"
  | "invalid_preset"
  | "preset_changed"
  | "unknown_node"
  | "already_active"
  | "point_limit"
  | "not_adjacent"
  | "conversion_conflict"
  | "difficulty_cap"
  | "not_active"
  | "start_required"
  | "would_disconnect"
  | "insufficient_gold";

function normalizedLevel(value: unknown): number {
  const level = Number(value);
  return Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
}

function normalizedMaterials(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
      const count = Math.max(0, Math.floor(Number(value) || 0));
      return count > 0 ? [[id, count]] : [];
    }),
  );
}

export function unexploredSnapshot(character: UnexploredCharacterSave) {
  const level = normalizedLevel(character.level);
  const save = parseUnexploredSave(character.unexplored);
  const effects = deriveUnexploredEffects(save.selectedNodeIds);
  const currentXpPoint = Math.max(save.xpPoints, level >= 100 ? 1 : 0);
  const nextPointCost = currentXpPoint >= 30
    ? 0
    : explorationPointCost(currentXpPoint + 1);
  return {
    level,
    eligible: canChangeUnexploredNodes(level),
    earnedPoints: unexploredEarnedPoints(level, save),
    spentPoints: save.selectedNodeIds.length,
    explorationXp: save.explorationXp,
    xpPoints: save.xpPoints,
    nextPointCost,
    nextPointRemaining: Math.max(0, nextPointCost - save.explorationXp),
    selectedNodeIds: save.selectedNodeIds,
    activePresetIndex: save.activePresetIndex,
    nodePresets: save.nodePresets,
    difficulty: effects.difficulty,
    difficultyIncrease: effects.difficultyIncrease,
    encounterShares: unexploredEncounterShares(effects.encounterSelections, {
      baseMinShare: effects.baseMinShare,
    }),
    rewardSummary: {
      ...effects.rewardPct,
      rareCopyChancePct: effects.rareCopyChancePct,
      traceExtraChancePct: effects.traceExtraChancePct,
      basePoolRewardPct: effects.basePoolRewardPct,
      conversion: effects.conversion,
    },
    effects,
    traces: save.traces,
    gold: Math.max(0, Math.floor(Number(character.gold) || 0)),
    bankedGold: Math.max(0, Math.floor(Number(character.bankedGold) || 0)),
    materials: normalizedMaterials(character.materials),
    achievementIds: save.achievementIds,
    refundGoldCost: UNEXPLORED_REFUND_GOLD_COST,
  };
}

function payRefundCost(
  character: UnexploredCharacterSave,
  count: number,
): { ok: true; gold: number; bankedGold: number } | { ok: false } {
  const payment = spendGold(
    Number(character.gold) || 0,
    Number(character.bankedGold) || 0,
    Math.max(0, count) * UNEXPLORED_REFUND_GOLD_COST,
  );
  return payment.ok
    ? { ok: true, gold: payment.gold, bankedGold: payment.bankedGold }
    : { ok: false };
}

function successfulMutation(
  character: UnexploredCharacterSave,
  save: UnexploredSave,
  wallet?: { gold: number; bankedGold: number },
) {
  const nextCharacter: UnexploredCharacterSave = {
    ...character,
    ...(wallet ? { gold: wallet.gold, bankedGold: wallet.bankedGold } : {}),
    unexplored: parseUnexploredSave(save),
  };
  return {
    ok: true as const,
    character: nextCharacter as UnexploredCharacterSave & {
      unexplored: UnexploredSave;
    },
    snapshot: unexploredSnapshot(nextCharacter),
  };
}

export function applyUnexploredMutation(
  character: UnexploredCharacterSave,
  mutation: UnexploredMutation,
):
  | ReturnType<typeof successfulMutation>
  | { ok: false; error: UnexploredMutationError } {
  const level = normalizedLevel(character.level);
  if (!canChangeUnexploredNodes(level)) {
    return { ok: false, error: "level_required" };
  }
  const save = parseUnexploredSave(character.unexplored);

  // Older clients only know the original first allocation. Never let their
  // delayed edits or reset requests alter another active preset.
  if ((mutation.expectedPresetIndex ?? 0) !== save.activePresetIndex) {
    return { ok: false, error: "preset_changed" };
  }
  if (mutation.action === "switch_preset") {
    if (!isUnexploredPresetIndex(mutation.presetIndex)) {
      return { ok: false, error: "invalid_preset" };
    }
    return successfulMutation(character, {
      ...save,
      activePresetIndex: mutation.presetIndex,
      selectedNodeIds: [...save.nodePresets[mutation.presetIndex]],
    });
  }

  if (mutation.action === "activate") {
    const error = unexploredActivationError(
      save.selectedNodeIds,
      mutation.nodeId,
      unexploredEarnedPoints(level, save),
    );
    if (error) return { ok: false, error };
    const selectedNodeIds = [...save.selectedNodeIds, mutation.nodeId];
    const activePoolCount = deriveUnexploredEffects(selectedNodeIds)
      .encounterSelections.length;
    const achievementGrant = grantUnexploredAchievements(
      { ...save, selectedNodeIds },
      unexploredAchievementCandidates({ activePoolCount }),
    );
    return successfulMutation(character, achievementGrant.save);
  }

  if (mutation.action === "activate_path") {
    const plan = unexploredActivationPath(
      save.selectedNodeIds,
      mutation.nodeId,
      unexploredEarnedPoints(level, save),
    );
    if (!plan.ok) return plan;
    const selectedNodeIds = [...save.selectedNodeIds, ...plan.nodeIds];
    const activePoolCount = deriveUnexploredEffects(selectedNodeIds)
      .encounterSelections.length;
    const achievementGrant = grantUnexploredAchievements(
      { ...save, selectedNodeIds },
      unexploredAchievementCandidates({ activePoolCount }),
    );
    return successfulMutation(character, achievementGrant.save);
  }

  if (mutation.action === "refund") {
    const error = unexploredRefundError(save.selectedNodeIds, mutation.nodeId);
    if (error) return { ok: false, error };
    const payment = payRefundCost(character, 1);
    if (!payment.ok) return { ok: false, error: "insufficient_gold" };
    return successfulMutation(
      character,
      {
        ...save,
        selectedNodeIds: save.selectedNodeIds.filter(
          (nodeId) => nodeId !== mutation.nodeId,
        ),
      },
      payment,
    );
  }

  if (mutation.action === "refund_path") {
    const plan = unexploredRefundPath(save.selectedNodeIds, mutation.nodeId);
    if (!plan.ok) return plan;
    const payment = payRefundCost(character, plan.nodeIds.length);
    if (!payment.ok) return { ok: false, error: "insufficient_gold" };
    const refunded = new Set(plan.nodeIds);
    return successfulMutation(
      character,
      {
        ...save,
        selectedNodeIds: save.selectedNodeIds.filter(
          (nodeId) => !refunded.has(nodeId),
        ),
      },
      payment,
    );
  }

  const refundableCount = save.selectedNodeIds.filter(
    (nodeId) => nodeId !== "start",
  ).length;
  const payment = payRefundCost(character, refundableCount);
  if (!payment.ok) return { ok: false, error: "insufficient_gold" };
  return successfulMutation(
    character,
    {
      ...save,
      selectedNodeIds: save.selectedNodeIds.includes("start") ? ["start"] : [],
    },
    payment,
  );
}
