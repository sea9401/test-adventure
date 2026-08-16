import { describe, expect, it } from "vitest";
import {
  STORM_EXPEDITION_ENTRANCE_NODE_IDS,
  STORM_EXPEDITION_MAP_NODES,
  stormExpeditionMapNode,
  type StormExpeditionMapNodeId,
} from "./stormExpeditionMap";

function pathsFrom(nodeId: StormExpeditionMapNodeId): StormExpeditionMapNodeId[][] {
  const node = stormExpeditionMapNode(nodeId);
  if (!node) throw new Error(`missing node: ${nodeId}`);
  if (node.nextNodeIds.length === 0) return [[nodeId]];
  return node.nextNodeIds.flatMap((nextId) =>
    pathsFrom(nextId).map((path) => [nodeId, ...path]),
  );
}

describe("폭풍 원정 고정 분기 그래프", () => {
  it("모든 연결은 존재하는 노드를 가리키고 모든 노드는 입구에서 도달 가능하다", () => {
    const ids = new Set(STORM_EXPEDITION_MAP_NODES.map((node) => node.id));
    for (const node of STORM_EXPEDITION_MAP_NODES) {
      for (const nextId of node.nextNodeIds) expect(ids.has(nextId)).toBe(true);
    }
    const reachable = new Set(pathsFrom(STORM_EXPEDITION_ENTRANCE_NODE_IDS[0]).flat());
    for (const entranceId of STORM_EXPEDITION_ENTRANCE_NODE_IDS.slice(1)) {
      for (const path of pathsFrom(entranceId)) path.forEach((id) => reachable.add(id));
    }
    expect(reachable).toEqual(ids);
  });

  it("모든 유효 경로는 순환 없이 체크포인트 9개와 전투 7회를 지난다", () => {
    const paths = STORM_EXPEDITION_ENTRANCE_NODE_IDS.flatMap(pathsFrom);
    expect(paths).toHaveLength(27);
    for (const path of paths) {
      expect(new Set(path).size).toBe(path.length);
      expect(path).toHaveLength(9);
      expect(path.reduce((sum, id) => sum + (stormExpeditionMapNode(id)?.encounterCount ?? 0), 0)).toBe(7);
      expect(path.at(-1)).toBe("storm_heart");
    }
  });

  it("항로 선택은 보급과 제단 다음에서만 갈라지고 중층부터 정예까지 같은 항로다", () => {
    const fanOut = STORM_EXPEDITION_MAP_NODES.filter((node) => node.nextNodeIds.length > 1);
    expect(fanOut.map((node) => node.id)).toEqual(["supply", "altar"]);
    for (const routeId of ["gale", "thunder", "wreckage"] as const) {
      expect(stormExpeditionMapNode(`${routeId}_middle`)?.nextNodeIds).toEqual([`${routeId}_camp`]);
      expect(stormExpeditionMapNode(`${routeId}_camp`)?.nextNodeIds).toEqual([`${routeId}_elite`]);
      expect(stormExpeditionMapNode(`${routeId}_elite`)?.nextNodeIds).toEqual(["altar"]);
    }
  });
});
