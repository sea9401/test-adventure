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
import type { StormExpeditionMode } from "@/adventure/data/v2/stormExpedition";
import type { StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";
