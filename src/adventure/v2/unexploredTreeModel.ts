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
import type { UnexploredAchievementId, UnexploredNodePresets, UnexploredPresetIndex } from "@/adventure/data/v2/unexploredState";
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
  activePresetIndex: UnexploredPresetIndex;
  nodePresets: UnexploredNodePresets;
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

export type UnexploredDifficultyApplication = { applied: number; total: number };

export type UnexploredTreeNodeModel = UnexploredNode & {
  state: UnexploredNodeState;
  planState: "activate" | "refund" | null;
  categoryLabel: string;
  activationError: UnexploredActivationError | "level_required" | null;
  /** 활성 위험 노드가 120단 상한 안에서 실제로 반영한 난이도. 그 외 노드는 null. */
  difficultyApplication: UnexploredDifficultyApplication | null;
};

export type UnexploredPoolRewardItem = {
  id: string;
  kind: "material" | "equipment";
  name: string;
  rateText: string;
};

export type UnexploredPoolRewards = {
  poolId: UnexploredPoolId;
  poolName: string;
  monsterNames: string[];
  items: UnexploredPoolRewardItem[];
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

/** 위험 노드가 120단 상한에 걸려 난이도·보상이 덜 반영될 때 상세 패널에 띄울 안내. 전부 반영되면 null. */
export function unexploredDifficultyCapNotice(
  application: UnexploredDifficultyApplication | null,
  active: boolean,
): string | null {
  if (!application || application.applied >= application.total) return null;
  if (application.applied === 0) {
    return active
      ? "120단을 넘겨 찍은 노드라 난이도와 보상이 적용되지 않고 경로만 연결합니다. 먼저 반영을 누르면 이 노드부터 120단을 채웁니다."
      : "지금 찍으면 120단 상한에 걸려 난이도와 보상이 적용되지 않고 경로만 연결합니다.";
  }
  const ratio = `난이도 +${application.total} 중 +${application.applied}만 반영되어 보상도 ${application.applied}/${application.total}만 적용`;
  return active ? `${ratio}됩니다.` : `지금 찍으면 ${ratio}됩니다.`;
}

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

function poolRewards(poolId: UnexploredPoolId): UnexploredPoolRewards {
  const pool = UNEXPLORED_POOL_BY_ID[poolId];
  const weapon = pool.weaponEquipmentId
    ? V2_EQUIPMENT[pool.weaponEquipmentId]
    : null;
  const items: UnexploredPoolRewardItem[] = [
    {
      id: pool.materialId,
      kind: "material",
      name: pool.materialName,
      rateText: "기본 1% · 집중 1.5%",
    },
  ];
  if (pool.weaponEquipmentId && weapon) {
    items.push({
      id: pool.weaponEquipmentId,
      kind: "equipment",
      name: weapon.name,
      rateText: "기본 0.1% · 집중 0.2%",
    });
  }
  for (const monster of pool.activeMonsters) {
    items.push({
      id: monster.equipmentId,
      kind: "equipment",
      name: V2_EQUIPMENT[monster.equipmentId].name,
      rateText: `${monster.name} 처치 시 · 기본 0.4% · 집중 0.6%`,
    });
  }
  return {
    poolId,
    poolName: pool.name,
    monsterNames: pool.activeMonsters.map((monster) => monster.name),
    items,
  };
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
  const currentEffects = deriveUnexploredEffects(snapshot.selectedNodeIds);
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
      difficultyApplication: active.has(node.id)
        ? currentEffects.difficultyApplication[node.id] ?? null
        : null,
    };
  });
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedPoolRewards = selected?.poolId
    ? poolRewards(selected.poolId)
    : null;
  const previewNodeIds = plan?.error === null
    ? plan.action === "activate"
      ? [...snapshot.selectedNodeIds, ...plan.nodeIds]
      : snapshot.selectedNodeIds.filter((nodeId) => !refundPlan.has(nodeId))
    : snapshot.selectedNodeIds;
  const previewEffects = deriveUnexploredEffects(previewNodeIds);
  const previewDifficulty = previewEffects.difficulty;
  // 활성 노드는 지금 반영분, 활성화 예정 노드는 찍은 뒤 반영분을 보여 준다.
  const selectedDifficultyApplication = selected?.state === "active"
    ? selected.difficultyApplication
    : selected && activationPlan.has(selected.id)
      ? previewEffects.difficultyApplication[selected.id] ?? null
      : null;
  // 상한에 걸린 노드가 있을 때만 순서를 바꿔 어느 노드가 보상을 받을지 고를 수 있다.
  const hasCappedNode = nodes.some((node) =>
    node.difficultyApplication !== null &&
    node.difficultyApplication.applied < node.difficultyApplication.total,
  );
  const selectedDifficultyOrder: "first" | "last" | null =
    hasCappedNode && selected?.state === "active" && selected.difficultyApplication
      ? selected.difficultyApplication.applied < selected.difficultyApplication.total
        ? "first"
        : "last"
      : null;
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
  const focusedPoolIds = new Set(currentEffects.focusedPoolIds);
  const poolSummary = snapshot.encounterShares.flatMap((share) =>
    share.kind === "pool"
      ? (() => {
          const poolId = share.poolId as UnexploredPoolId;
          const pool = UNEXPLORED_POOL_BY_ID[poolId];
          const weapon = pool.weaponEquipmentId
            ? V2_EQUIPMENT[pool.weaponEquipmentId]
            : null;
          const focused = focusedPoolIds.has(poolId);
          return [{
            poolId,
            name: unexploredPoolName(poolId),
            share: share.share,
            materialName: pool.materialName,
            materialRateText: focused ? "1.5% (집중 적용)" : "1% (집중 시 1.5%)",
            weaponName: weapon?.name ?? null,
            weaponRateText: weapon
              ? focused ? "0.2% (집중 적용)" : "0.1% (집중 시 0.2%)"
              : null,
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
    selectedDifficultyApplication,
    selectedDifficultyOrder,
    poolSummary,
    selectedPoolRewards,
  };
}
