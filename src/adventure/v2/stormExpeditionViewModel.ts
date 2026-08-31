import type { StormExpeditionChoiceKind, StormExpeditionMode } from "@/adventure/data/v2/stormExpedition";
import type { StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";

export type StormExpeditionActionRequest =
  | ReturnType<typeof stormExpeditionStartRequest>
  | ReturnType<typeof stormExpeditionMoveRequest>
  | ReturnType<typeof stormExpeditionFightRequest>
  | ReturnType<typeof stormExpeditionChooseRequest>
  | ReturnType<typeof stormExpeditionRiskRequest>
  | ReturnType<typeof stormExpeditionWithdrawRequest>;

export type StormExpeditionNodeIntent = {
  kind: "battle" | "choice" | "risk" | "move" | "completed" | "locked";
};

type StormExpeditionNodeIntentActive = {
  currentNodeId: StormExpeditionMapNodeId;
  visitedNodeIds: readonly StormExpeditionMapNodeId[];
  completedNodeIds: readonly StormExpeditionMapNodeId[];
  riskEvent: {
    status: "offered" | "accepted" | "declined";
    triggerCheckpoint: "supply" | "camp" | "altar";
  } | null;
};

export function stormExpeditionEntryActions(attemptsLeft: number) {
  const canEnterNormal = attemptsLeft > 0;
  return {
    normal: {
      enabled: canEnterNormal,
      label: canEnterNormal ? "실전 출발" : "오늘 입장 완료",
    },
    practice: {
      enabled: true,
      label: "연습 시작",
      description: "입장 횟수 소모 없음 · 보상 없음",
    },
  } as const;
}

export function stormExpeditionNodeIntent(
  nodeId: StormExpeditionMapNodeId,
  active: StormExpeditionNodeIntentActive | null,
  availableNodeIds: readonly StormExpeditionMapNodeId[],
  nodeKind: "battle" | StormExpeditionChoiceKind,
): StormExpeditionNodeIntent {
  if (!active) return { kind: availableNodeIds.includes(nodeId) ? "move" : "locked" };
  if (nodeId !== active.currentNodeId) {
    if (active.completedNodeIds.includes(nodeId) || active.visitedNodeIds.includes(nodeId)) {
      return { kind: "completed" };
    }
    return { kind: availableNodeIds.includes(nodeId) ? "move" : "locked" };
  }
  if (active.completedNodeIds.includes(nodeId)) return { kind: "completed" };
  if (hasPendingRiskAtNode(nodeId, active.riskEvent)) return { kind: "risk" };
  return { kind: nodeKind === "battle" ? "battle" : "choice" };
}

export function stormExpeditionStartRequest(mode: StormExpeditionMode, targetNodeId: StormExpeditionMapNodeId) {
  return { action: "start" as const, mode, targetNodeId };
}

export function stormExpeditionMoveRequest(
  targetNodeId: StormExpeditionMapNodeId,
  expectedCurrentNodeId: StormExpeditionMapNodeId,
  expectedEncounterIndex: number,
) {
  return { action: "move" as const, targetNodeId, expectedCurrentNodeId, expectedEncounterIndex };
}

export function stormExpeditionFightRequest(
  expectedCurrentNodeId: StormExpeditionMapNodeId,
  expectedEncounterIndex: number,
) {
  return { action: "fight" as const, expectedCurrentNodeId, expectedEncounterIndex };
}

export function stormExpeditionChooseRequest(
  choiceId: string,
  expectedCurrentNodeId: StormExpeditionMapNodeId,
  expectedEncounterIndex: number,
) {
  return { action: "choose" as const, choiceId, expectedCurrentNodeId, expectedEncounterIndex };
}

export function stormExpeditionRiskRequest(
  decision: "accept" | "decline",
  expectedCurrentNodeId: StormExpeditionMapNodeId,
  expectedEncounterIndex: number,
) {
  return { action: "risk_event" as const, decision, expectedCurrentNodeId, expectedEncounterIndex };
}

export function stormExpeditionWithdrawRequest(
  expectedCurrentNodeId: StormExpeditionMapNodeId,
  expectedEncounterIndex: number,
) {
  return { action: "withdraw" as const, expectedCurrentNodeId, expectedEncounterIndex };
}

function hasPendingRiskAtNode(
  nodeId: StormExpeditionMapNodeId,
  riskEvent: StormExpeditionNodeIntentActive["riskEvent"],
): boolean {
  if (riskEvent?.status !== "offered") return false;
  if (nodeId === "supply") return riskEvent.triggerCheckpoint === "supply";
  if (nodeId === "altar") return riskEvent.triggerCheckpoint === "altar";
  return nodeId.endsWith("_camp") && riskEvent.triggerCheckpoint === "camp";
}
