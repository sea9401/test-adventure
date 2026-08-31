import type {
  StormExpeditionChoiceKind,
  StormExpeditionEncounterKind,
  StormExpeditionRouteId,
} from "./stormExpedition";

export type StormExpeditionMapNodeId =
  | `${StormExpeditionRouteId}_outer`
  | "supply"
  | `${StormExpeditionRouteId}_middle`
  | `${StormExpeditionRouteId}_camp`
  | `${StormExpeditionRouteId}_elite`
  | "altar"
  | `${StormExpeditionRouteId}_guardian`
  | "final_prep"
  | "storm_heart";

export type StormExpeditionMapNode = {
  id: StormExpeditionMapNodeId;
  name: string;
  kind: "battle" | StormExpeditionChoiceKind;
  encounterKind?: StormExpeditionEncounterKind;
  encounterCount?: number;
  description: string;
  routeId: StormExpeditionRouteId | null;
  x: number;
  y: number;
  nextNodeIds: readonly StormExpeditionMapNodeId[];
};

export const STORM_EXPEDITION_ENTRANCE_NODE_IDS = [
  "gale_outer", "thunder_outer", "wreckage_outer",
] as const satisfies readonly StormExpeditionMapNodeId[];

const ROUTE_LABELS: Record<StormExpeditionRouteId, string> = {
  gale: "칼바람",
  thunder: "뇌운",
  wreckage: "잔해",
};
const ROUTE_Y: Record<StormExpeditionRouteId, number> = { gale: 70, thunder: 210, wreckage: 350 };

const routeNodes = (["gale", "thunder", "wreckage"] as const).flatMap((routeId) => {
  const label = ROUTE_LABELS[routeId];
  const y = ROUTE_Y[routeId];
  return [
    { id: `${routeId}_outer`, name: `${label} 외곽`, kind: "battle", encounterKind: "early_trash", encounterCount: 2, description: "잡몹 2연전", routeId, x: 80, y, nextNodeIds: ["supply"] },
    { id: `${routeId}_middle`, name: `${label} 중층`, kind: "battle", encounterKind: "late_trash", encounterCount: 2, description: "강화 잡몹 2연전", routeId, x: 320, y, nextNodeIds: [`${routeId}_camp`] },
    { id: `${routeId}_camp`, name: `${label} 야영지`, kind: "camp", description: "HP·MP 정비", routeId, x: 440, y, nextNodeIds: [`${routeId}_elite`] },
    { id: `${routeId}_elite`, name: `${label} 정예`, kind: "battle", encounterKind: "elite", encounterCount: 1, description: "항로 정예 전투", routeId, x: 560, y, nextNodeIds: ["altar"] },
    { id: `${routeId}_guardian`, name: `${label} 수호자`, kind: "battle", encounterKind: "guardian", encounterCount: 1, description: "항로별 수호자", routeId, x: 800, y, nextNodeIds: ["final_prep"] },
  ] as StormExpeditionMapNode[];
});

export const STORM_EXPEDITION_MAP_NODES: readonly StormExpeditionMapNode[] = [
  ...routeNodes.filter((node) => node.id.endsWith("_outer")),
  { id: "supply", name: "표류 보급품", kind: "supply", description: "회복 또는 다음 전투 준비", routeId: null, x: 200, y: 210, nextNodeIds: ["gale_middle", "thunder_middle", "wreckage_middle"] },
  ...routeNodes.filter((node) => node.id.endsWith("_middle") || node.id.endsWith("_camp") || node.id.endsWith("_elite")),
  { id: "altar", name: "폭풍 제단", kind: "altar", description: "원정 전용 능력 하나 획득", routeId: null, x: 680, y: 210, nextNodeIds: ["gale_guardian", "thunder_guardian", "wreckage_guardian"] },
  ...routeNodes.filter((node) => node.id.endsWith("_guardian")),
  { id: "final_prep", name: "최종 정비", kind: "final_prep", description: "폭풍의 심장 진입 준비", routeId: null, x: 920, y: 210, nextNodeIds: ["storm_heart"] },
  { id: "storm_heart", name: "폭풍의 심장", kind: "battle", encounterKind: "final_boss", encounterCount: 1, description: "모든 항로의 공통 최종 보스", routeId: null, x: 1040, y: 210, nextNodeIds: [] },
];

const MAP_NODE_BY_ID = new Map(STORM_EXPEDITION_MAP_NODES.map((node) => [node.id, node]));

export function stormExpeditionMapNode(id: unknown): StormExpeditionMapNode | null {
  return typeof id === "string" ? MAP_NODE_BY_ID.get(id as StormExpeditionMapNodeId) ?? null : null;
}

export function stormExpeditionNextNodeIds(id: StormExpeditionMapNodeId): readonly StormExpeditionMapNodeId[] {
  return stormExpeditionMapNode(id)?.nextNodeIds ?? [];
}

export function stormExpeditionNodeRoute(id: StormExpeditionMapNodeId): StormExpeditionRouteId | null {
  return stormExpeditionMapNode(id)?.routeId ?? null;
}

export function stormExpeditionRouteNodeId(
  routeId: StormExpeditionRouteId,
  checkpoint: "outer" | "middle" | "camp" | "elite" | "guardian",
): StormExpeditionMapNodeId {
  return `${routeId}_${checkpoint}`;
}

export function stormExpeditionAvailableNextNodeIds(active: {
  currentNodeId: StormExpeditionMapNodeId;
  completedNodeIds: readonly StormExpeditionMapNodeId[];
  visitedNodeIds: readonly StormExpeditionMapNodeId[];
}): StormExpeditionMapNodeId[] {
  if (!active.completedNodeIds.includes(active.currentNodeId)) return [];
  return stormExpeditionNextNodeIds(active.currentNodeId).filter((id) => !active.visitedNodeIds.includes(id));
}
