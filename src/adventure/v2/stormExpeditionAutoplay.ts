import {
  STORM_EXPEDITION_RISK_EVENTS,
  type StormExpeditionBoonId,
  type StormExpeditionChoice,
  type StormExpeditionChoiceKind,
  type StormExpeditionMode,
  type StormExpeditionRiskEventOffer,
} from "@/adventure/data/v2/stormExpedition";
import type {
  StormExpeditionMapNode,
  StormExpeditionMapNodeId,
} from "@/adventure/data/v2/stormExpeditionMap";
import {
  chooseStormExpeditionBoon,
  chooseStormExpeditionCheckpointChoice,
  isStormExpeditionPlanCompatible,
  stormExpeditionPlannedNodeId,
  type StormExpeditionAutoplayPlan,
} from "./stormExpeditionAutoplayPolicy";
import {
  stormExpeditionChooseRequest,
  stormExpeditionFightRequest,
  stormExpeditionMoveRequest,
  stormExpeditionRiskRequest,
  stormExpeditionStartRequest,
  type StormExpeditionActionRequest,
} from "./stormExpeditionViewModel";

export type StormExpeditionAutoplayActive = {
  mode: StormExpeditionMode;
  currentNodeId: StormExpeditionMapNodeId;
  visitedNodeIds: readonly StormExpeditionMapNodeId[];
  completedNodeIds: readonly StormExpeditionMapNodeId[];
  encounterIndex: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  boons: readonly StormExpeditionBoonId[];
  altarOffers: readonly StormExpeditionBoonId[];
  riskEvent: StormExpeditionRiskEventOffer | null;
};

export type StormExpeditionAutoplayStatus = {
  ok?: boolean;
  error?: string;
  failed?: boolean;
  bossClear?: boolean;
  practiceCompleted?: boolean;
  state?: { active: StormExpeditionAutoplayActive | null };
  nodes?: readonly StormExpeditionMapNode[];
  availableNextNodeIds?: readonly StormExpeditionMapNodeId[];
  choices?: Partial<Record<StormExpeditionChoiceKind, readonly StormExpeditionChoice[]>>;
};

export type StormExpeditionAutoplayStep =
  | { kind: "request"; request: StormExpeditionActionRequest; label: string }
  | { kind: "complete" }
  | { kind: "defeated" }
  | { kind: "conflict"; message: string };

export type StormExpeditionAutoplayRunResult =
  | { kind: "complete"; status: StormExpeditionAutoplayStatus }
  | { kind: "defeated"; status: StormExpeditionAutoplayStatus }
  | { kind: "stopped"; status: StormExpeditionAutoplayStatus }
  | { kind: "stale"; status: StormExpeditionAutoplayStatus }
  | { kind: "conflict"; status: StormExpeditionAutoplayStatus; message: string }
  | { kind: "error"; status: StormExpeditionAutoplayStatus; error: unknown };

type StormExpeditionAutoplayRunnerOptions = {
  initialStatus: StormExpeditionAutoplayStatus;
  plan: StormExpeditionAutoplayPlan;
  request: (request: StormExpeditionActionRequest) => Promise<StormExpeditionAutoplayStatus>;
  onStatus: (status: StormExpeditionAutoplayStatus, label: string) => void;
  shouldStop: () => boolean;
};

export function nextStormExpeditionAutoplayStep(
  status: StormExpeditionAutoplayStatus,
  plan: StormExpeditionAutoplayPlan,
): StormExpeditionAutoplayStep {
  if (status.failed) return { kind: "defeated" };
  if (status.bossClear || status.practiceCompleted) return { kind: "complete" };

  const active = status.state?.active ?? null;
  if (!active) {
    const targetNodeId = stormExpeditionPlannedNodeId(plan, "outer");
    return {
      kind: "request",
      label: `${nodeName(status, targetNodeId)} 출발 중`,
      request: stormExpeditionStartRequest(plan.mode, targetNodeId),
    };
  }

  if (!isStormExpeditionPlanCompatible(plan, active.visitedNodeIds)) {
    return { kind: "conflict", message: "현재 방문 경로와 저장된 일괄 진행 계획이 다릅니다." };
  }

  const currentNode = status.nodes?.find((node) => node.id === active.currentNodeId);
  if (!currentNode) {
    return { kind: "conflict", message: "현재 체크포인트 정보를 찾을 수 없습니다." };
  }

  if (isPendingRiskAtCurrentNode(active)) {
    const riskName = STORM_EXPEDITION_RISK_EVENTS[active.riskEvent!.id]?.name ?? "위험 이벤트";
    return {
      kind: "request",
      label: `${riskName} 지나치는 중`,
      request: stormExpeditionRiskRequest("decline", active.currentNodeId, active.encounterIndex),
    };
  }

  const completed = active.completedNodeIds.includes(active.currentNodeId);
  if (!completed) {
    if (currentNode.kind === "battle") {
      const encounterLabel = (currentNode.encounterCount ?? 1) > 1
        ? ` ${active.encounterIndex + 1}전`
        : "";
      return {
        kind: "request",
        label: `${currentNode.name}${encounterLabel} 전투 중`,
        request: stormExpeditionFightRequest(active.currentNodeId, active.encounterIndex),
      };
    }
    const choiceId = automaticChoiceId(currentNode.kind, active, plan);
    if (!choiceId) {
      return {
        kind: "conflict",
        message: currentNode.kind === "altar"
          ? "자동으로 선택할 수 있는 제단 축복이 없습니다."
          : `${currentNode.name}에서 자동 선택을 결정할 수 없습니다.`,
      };
    }
    const catalog = status.choices?.[currentNode.kind] ?? [];
    const choice = catalog.find((candidate) => candidate.id === choiceId);
    if (!choice) {
      return { kind: "conflict", message: `${currentNode.name} 선택 정보가 서버 상태와 다릅니다.` };
    }
    return {
      kind: "request",
      label: `${choice.name} 선택 중`,
      request: stormExpeditionChooseRequest(choiceId, active.currentNodeId, active.encounterIndex),
    };
  }

  const targetNodeId = plannedNextNodeId(active.currentNodeId, currentNode, plan);
  if (!targetNodeId || !(status.availableNextNodeIds ?? []).includes(targetNodeId)) {
    const targetName = targetNodeId ? nodeName(status, targetNodeId) : "다음 체크포인트";
    return { kind: "conflict", message: `계획한 ${targetName}으로 이동할 수 없습니다.` };
  }
  return {
    kind: "request",
    label: `${nodeName(status, targetNodeId)} 이동 중`,
    request: stormExpeditionMoveRequest(targetNodeId, active.currentNodeId, active.encounterIndex),
  };
}

export async function runStormExpeditionAutoplay({
  initialStatus,
  plan,
  request,
  onStatus,
  shouldStop,
}: StormExpeditionAutoplayRunnerOptions): Promise<StormExpeditionAutoplayRunResult> {
  let status = initialStatus;
  while (true) {
    if (shouldStop()) return { kind: "stopped", status };
    const step = nextStormExpeditionAutoplayStep(status, plan);
    if (step.kind === "complete" || step.kind === "defeated") return { kind: step.kind, status };
    if (step.kind === "conflict") return { kind: "conflict", status, message: step.message };

    try {
      status = await request(step.request);
      onStatus(status, step.label);
    } catch (error) {
      return { kind: "error", status, error };
    }

    if (status.error === "stale_state") return { kind: "stale", status };
    if (status.ok === false || status.error) {
      return { kind: "error", status, error: new Error(status.error ?? "storm_expedition_request_failed") };
    }
  }
}

function automaticChoiceId(
  kind: StormExpeditionChoiceKind,
  active: StormExpeditionAutoplayActive,
  plan: StormExpeditionAutoplayPlan,
): string | null {
  if (kind === "altar") {
    return chooseStormExpeditionBoon(plan.boonStrategy, active.altarOffers, active.boons);
  }
  return chooseStormExpeditionCheckpointChoice(kind, active);
}

function plannedNextNodeId(
  currentNodeId: StormExpeditionMapNodeId,
  currentNode: StormExpeditionMapNode,
  plan: StormExpeditionAutoplayPlan,
): StormExpeditionMapNodeId | null {
  if (currentNodeId === "supply") return stormExpeditionPlannedNodeId(plan, "middle");
  if (currentNodeId === "altar") return stormExpeditionPlannedNodeId(plan, "guardian");
  return currentNode.nextNodeIds.length === 1 ? currentNode.nextNodeIds[0] : null;
}

function isPendingRiskAtCurrentNode(active: StormExpeditionAutoplayActive): boolean {
  const risk = active.riskEvent;
  if (!risk || risk.status !== "offered") return false;
  if (active.currentNodeId === "supply") return risk.triggerCheckpoint === "supply";
  if (active.currentNodeId === "altar") return risk.triggerCheckpoint === "altar";
  return active.currentNodeId.endsWith("_camp") && risk.triggerCheckpoint === "camp";
}

function nodeName(status: StormExpeditionAutoplayStatus, nodeId: StormExpeditionMapNodeId): string {
  return status.nodes?.find((node) => node.id === nodeId)?.name ?? nodeId;
}
