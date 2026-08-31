import type { UnexploredTraceState } from "@/adventure/data/v2/unexploredRewards";
import type { UnexploredPoolId } from "@/adventure/data/v2/unexploredMonsterPools";
import {
  UNEXPLORED_EDGES,
  UNEXPLORED_NODES,
  deriveUnexploredEffects,
  shortestUnexploredPath,
  unexploredActivationError,
  unexploredPoolName,
  type UnexploredNode,
} from "@/adventure/data/v2/unexploredTree";
import type { UnexploredAchievementId } from "@/adventure/data/v2/unexploredState";
import type { UnexploredEncounterShare } from "@/adventure/data/v2/unexploredEncounters";

export type UnexploredClientSnapshot = {
  level: number;
  eligible: boolean;
  earnedPoints: number;
  spentPoints: number;
  explorationXp: number;
  xpPoints: number;
  nextPointCost: number;
  nextPointRemaining: number;
  selectedNodeIds: string[];
  difficulty: number;
  difficultyIncrease: number;
  encounterShares: UnexploredEncounterShare[];
  rewardSummary: {
    gold: number;
    baseMaterial: number;
    equipment: number;
    quality: number;
    specialMaterial: number;
    rare: number;
    rareCopyChancePct: number;
    traceExtraChancePct: number;
    basePoolRewardPct: number;
    conversion: null | "gold" | "collector" | "armory";
  };
  traces: UnexploredTraceState;
  achievementIds: UnexploredAchievementId[];
  refundGoldCost: number;
};

export type UnexploredNodeState = "active" | "available" | "locked";

export type UnexploredTreeNodeModel = UnexploredNode & {
  state: UnexploredNodeState;
  categoryLabel: string;
};

function categoryLabel(node: UnexploredNode): string {
  if (
    node.effects.some(
      (effect) =>
        effect.kind === "deep" &&
        ["gold", "collector", "armory"].includes(effect.effect),
    )
  ) {
    return "보상 전환";
  }
  if (node.effects.some((effect) => effect.kind === "difficulty_reward")) {
    return "위험과 보상";
  }
  return {
    start: "탐사 시작",
    small: "공용 성장",
    medium: "중형 선택",
    pool: "특화 몬스터",
    enhancer: "특화 강화",
    deep: "심층 선택",
  }[node.kind];
}

export function buildUnexploredTreeModel(
  snapshot: UnexploredClientSnapshot,
  selectedNodeId: string | null,
) {
  const active = new Set(snapshot.selectedNodeIds);
  const previewPath = selectedNodeId
    ? shortestUnexploredPath(selectedNodeId)
    : [];
  const previewPathSet = new Set(previewPath);
  const nodes: UnexploredTreeNodeModel[] = UNEXPLORED_NODES.map((node) => {
    const state: UnexploredNodeState = active.has(node.id)
      ? "active"
      : snapshot.eligible &&
          unexploredActivationError(
            snapshot.selectedNodeIds,
            node.id,
            snapshot.earnedPoints,
          ) === null
        ? "available"
        : "locked";
    return { ...node, state, categoryLabel: categoryLabel(node) };
  });
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const previewDifficulty =
    selected?.state === "available"
      ? deriveUnexploredEffects([...snapshot.selectedNodeIds, selected.id]).difficulty
      : snapshot.difficulty;
  const edges = UNEXPLORED_EDGES.map(([left, right]) => ({
    left,
    right,
    state:
      active.has(left) && active.has(right)
        ? ("active" as const)
        : previewPathSet.has(left) && previewPathSet.has(right)
          ? ("preview" as const)
          : ("inactive" as const),
  }));
  const poolSummary = snapshot.encounterShares.flatMap((share) =>
    share.kind === "pool"
      ? [{
          poolId: share.poolId as UnexploredPoolId,
          name: unexploredPoolName(share.poolId),
          share: share.share,
        }]
      : [],
  );

  return {
    nodes,
    edges,
    selected,
    previewPath,
    currentDifficulty: snapshot.difficulty,
    previewDifficulty,
    poolSummary,
  };
}
