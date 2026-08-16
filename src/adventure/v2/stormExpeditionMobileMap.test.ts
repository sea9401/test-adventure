import { describe, expect, it } from "vitest";
import { STORM_EXPEDITION_MAP_NODES } from "@/adventure/data/v2/stormExpeditionMap";
import {
  STORM_EXPEDITION_MOBILE_SEGMENTS,
  stormExpeditionMobileSegment,
} from "./stormExpeditionMobileMap";

describe("폭풍 원정 모바일 구간 지도", () => {
  it.each([
    [null, 1],
    ["gale_outer", 1],
    ["supply", 2],
    ["thunder_middle", 2],
    ["wreckage_camp", 2],
    ["gale_elite", 2],
    ["altar", 3],
    ["thunder_guardian", 3],
    ["final_prep", 3],
    ["storm_heart", 3],
  ] as const)("현재 노드 %s는 %i구간을 표시한다", (currentNodeId, segmentId) => {
    expect(stormExpeditionMobileSegment(currentNodeId).id).toBe(segmentId);
  });

  it("각 구간은 합류 노드를 공유하고 화면 폭 안의 유효한 노드만 배치한다", () => {
    const nodeIds = new Set(STORM_EXPEDITION_MAP_NODES.map((node) => node.id));

    expect(STORM_EXPEDITION_MOBILE_SEGMENTS.map((segment) => segment.height)).toEqual([
      300,
      550,
      430,
    ]);
    expect(STORM_EXPEDITION_MOBILE_SEGMENTS[0].nodes.map((node) => node.id)).toContain("supply");
    expect(STORM_EXPEDITION_MOBILE_SEGMENTS[1].nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(["supply", "altar"]),
    );
    expect(STORM_EXPEDITION_MOBILE_SEGMENTS[2].nodes.map((node) => node.id)).toContain("altar");

    for (const segment of STORM_EXPEDITION_MOBILE_SEGMENTS) {
      for (const node of segment.nodes) {
        expect(nodeIds.has(node.id)).toBe(true);
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x).toBeLessThanOrEqual(360);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeLessThanOrEqual(segment.height);
      }
    }
  });
});
