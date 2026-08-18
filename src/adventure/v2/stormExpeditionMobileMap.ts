import type { StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";

export type StormExpeditionMobileNodeLayout = {
  id: StormExpeditionMapNodeId;
  x: number;
  y: number;
};

export type StormExpeditionMobileWindow = {
  label: "입구 선택" | "현재 + 다음 경로" | "현재 체크포인트";
  height: 180 | 260;
  nodes: readonly StormExpeditionMobileNodeLayout[];
};

const X_POSITIONS_BY_COUNT: Record<number, readonly number[]> = {
  1: [180],
  2: [120, 240],
  3: [60, 180, 300],
};

export function stormExpeditionMobileWindow(
  currentNodeId: StormExpeditionMapNodeId | null,
  previewableNodeIds: readonly StormExpeditionMapNodeId[],
): StormExpeditionMobileWindow {
  const candidates = [...new Set(previewableNodeIds)]
    .filter((nodeId) => nodeId !== currentNodeId)
    .slice(0, 3);

  if (!currentNodeId) {
    return {
      label: "입구 선택",
      height: 180,
      nodes: positionRow(candidates, 90),
    };
  }

  if (candidates.length === 0) {
    return {
      label: "현재 체크포인트",
      height: 180,
      nodes: [{ id: currentNodeId, x: 180, y: 90 }],
    };
  }

  return {
    label: "현재 + 다음 경로",
    height: 260,
    nodes: [
      { id: currentNodeId, x: 180, y: 70 },
      ...positionRow(candidates, 190),
    ],
  };
}

function positionRow(
  nodeIds: readonly StormExpeditionMapNodeId[],
  y: number,
): StormExpeditionMobileNodeLayout[] {
  const positions = X_POSITIONS_BY_COUNT[nodeIds.length] ?? [];
  return nodeIds.map((id, index) => ({ id, x: positions[index], y }));
}
