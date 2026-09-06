import type { UnexploredTraceState } from "@/adventure/data/v2/unexploredRewards";
import {
  UNEXPLORED_POOL_BY_ID,
  type UnexploredPoolId,
} from "@/adventure/data/v2/unexploredMonsterPools";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import {
  UNEXPLORED_EDGES,
  UNEXPLORED_NODE_BY_ID,
  UNEXPLORED_NODES,
  deriveUnexploredEffects,
  shortestUnexploredPathFromActive,
  unexploredActivationError,
  unexploredActivationPath,
  unexploredPoolName,
  unexploredRefundPath,
  type UnexploredActivationError,
  type UnexploredNode,
  type UnexploredRefundError,
} from "@/adventure/data/v2/unexploredTree";
import type { UnexploredAchievementId } from "@/adventure/data/v2/unexploredState";
import type { UnexploredEncounterShare } from "@/adventure/data/v2/unexploredEncounters";
import type { UnexploredEffects } from "@/adventure/data/v2/unexploredTree";
import { buildUnexploredEdgeRoute } from "./unexploredTreeGeometry";

const UNEXPLORED_EDGE_ROUTES = UNEXPLORED_EDGES.map(([left, right]) =>
  buildUnexploredEdgeRoute(
    UNEXPLORED_NODE_BY_ID.get(left)!,
    UNEXPLORED_NODE_BY_ID.get(right)!,
    UNEXPLORED_NODES,
  ),
);

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
  effects?: Pick<UnexploredEffects, "traceEnabled">;
  traces: UnexploredTraceState;
  gold: number;
  bankedGold: number;
  materials: Record<string, number>;
  achievementIds: UnexploredAchievementId[];
  refundGoldCost: number;
  summonStoneCraftCost: {
    baseGoldCost: number;
    goldCost: number;
    liberationDiscountPct: number;
  };
};

export type UnexploredNodeState = "active" | "available" | "locked";

export type UnexploredTreeNodeModel = UnexploredNode & {
  state: UnexploredNodeState;
  planState: "activate" | "refund" | null;
  categoryLabel: string;
  activationError: UnexploredActivationError | "level_required" | null;
};

export type UnexploredTreePlan = {
  action: "activate" | "refund";
  nodeIds: string[];
  error:
    | UnexploredActivationError
    | UnexploredRefundError
    | "level_required"
    | null;
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
    ? shortestUnexploredPathFromActive(snapshot.selectedNodeIds, selectedNodeId)
    : [];
  const previewPathSet = new Set(previewPath);
  // 비용 안내는 활성화 가능 여부와 분리해 잔액이 부족해도 전체 필요량을 보여준다.
  const requiredPoints = previewPath.filter((id) => !active.has(id)).length;
  const availablePoints = Math.max(0, snapshot.earnedPoints - snapshot.spentPoints);
  const routePointPreview = requiredPoints > 0
    ? {
        required: requiredPoints,
        available: availablePoints,
        shortfall: Math.max(0, requiredPoints - availablePoints),
      }
    : null;
  let plan: UnexploredTreePlan | null = null;
  if (selectedNodeId && !(active.has(selectedNodeId) && selectedNodeId === "start")) {
    const action = active.has(selectedNodeId) ? "refund" : "activate";
    if (!snapshot.eligible) {
      plan = { action, nodeIds: [], error: "level_required" };
    } else {
      const result = action === "activate"
        ? unexploredActivationPath(
            snapshot.selectedNodeIds,
            selectedNodeId,
            snapshot.earnedPoints,
          )
        : unexploredRefundPath(snapshot.selectedNodeIds, selectedNodeId);
      plan = result.ok
        ? { action, nodeIds: result.nodeIds, error: null }
        : { action, nodeIds: [], error: result.error };
    }
  }
  const activationPlan = new Set(
    plan?.action === "activate" && plan.error === null ? plan.nodeIds : [],
  );
  const refundPlan = new Set(
    plan?.action === "refund" && plan.error === null ? plan.nodeIds : [],
  );
  const nodes: UnexploredTreeNodeModel[] = UNEXPLORED_NODES.map((node) => {
    const activationError = active.has(node.id)
      ? null
      : !snapshot.eligible
        ? "level_required"
        : unexploredActivationError(
            snapshot.selectedNodeIds,
            node.id,
            snapshot.earnedPoints,
          );
    const state: UnexploredNodeState = active.has(node.id)
      ? "active"
      : activationError === null
        ? "available"
        : "locked";
    return {
      ...node,
      state,
      planState: activationPlan.has(node.id)
        ? "activate"
        : refundPlan.has(node.id)
          ? "refund"
          : null,
      categoryLabel: categoryLabel(node),
      activationError,
    };
  });
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const previewNodeIds = plan?.error === null
    ? plan.action === "activate"
      ? [...snapshot.selectedNodeIds, ...plan.nodeIds]
      : snapshot.selectedNodeIds.filter((nodeId) => !refundPlan.has(nodeId))
    : snapshot.selectedNodeIds;
  const previewDifficulty = deriveUnexploredEffects(previewNodeIds).difficulty;
  const edges = UNEXPLORED_EDGES.map(([left, right], index) => ({
    left,
    right,
    path: UNEXPLORED_EDGE_ROUTES[index].path,
    state:
      active.has(left) &&
      active.has(right) &&
      (refundPlan.has(left) || refundPlan.has(right))
        ? ("refund" as const)
        : active.has(left) && active.has(right)
        ? ("active" as const)
        : activationPlan.size > 0 &&
            previewPathSet.has(left) &&
            previewPathSet.has(right)
          ? ("preview" as const)
          : ("inactive" as const),
  }));
  const poolSummary = snapshot.encounterShares.flatMap((share) =>
    share.kind === "pool"
      ? (() => {
          const poolId = share.poolId as UnexploredPoolId;
          const pool = UNEXPLORED_POOL_BY_ID[poolId];
          const weapon = pool.weaponEquipmentId
            ? V2_EQUIPMENT[pool.weaponEquipmentId]
            : null;
          return [{
            poolId,
            name: unexploredPoolName(poolId),
            share: share.share,
            materialName: pool.materialName,
            materialRateText: "1% · 집중 1.5%",
            weaponName: weapon?.name ?? null,
            weaponRateText: weapon ? "0.1% · 집중 0.2%" : null,
          }];
        })()
      : [],
  );

  return {
    nodes,
    edges,
    selected,
    plan,
    previewPath,
    routePointPreview,
    currentDifficulty: snapshot.difficulty,
    previewDifficulty,
    poolSummary,
  };
}
