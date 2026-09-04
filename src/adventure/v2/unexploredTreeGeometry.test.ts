import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_NODE_BY_ID,
  UNEXPLORED_NODES,
} from "@/adventure/data/v2/unexploredTree";
import {
  buildUnexploredTreeModel,
  type UnexploredClientSnapshot,
} from "./unexploredTreeModel";

const NODE_RADIUS = {
  start: 34,
  small: 15,
  medium: 25,
  pool: 31,
  enhancer: 22,
  deep: 34,
} as const;

function snapshot(): UnexploredClientSnapshot {
  return {
    level: 100,
    eligible: true,
    earnedPoints: 0,
    spentPoints: 0,
    explorationXp: 0,
    xpPoints: 0,
    nextPointCost: 100,
    nextPointRemaining: 100,
    selectedNodeIds: [],
    difficulty: 95,
    difficultyIncrease: 0,
    encounterShares: [{ kind: "base", share: 100 }],
    rewardSummary: {
      gold: 0,
      baseMaterial: 0,
      equipment: 0,
      quality: 0,
      specialMaterial: 0,
      rare: 0,
      rareCopyChancePct: 0,
      traceExtraChancePct: 0,
      basePoolRewardPct: 0,
      conversion: null,
    },
    effects: { traceEnabled: false },
    traces: {},
    gold: 0,
    bankedGold: 0,
    materials: {},
    achievementIds: [],
    refundGoldCost: 1_000_000,
    summonStoneCraftCost: {
      baseGoldCost: 5_000_000,
      goldCost: 5_000_000,
      liberationDiscountPct: 0,
    },
  };
}

type Point = { x: number; y: number };

function renderedPath(edge: unknown): string | undefined {
  return (edge as { path?: string }).path;
}

function sampledRoute(path: string): Point[] {
  const values = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (path.includes(" Q ")) {
    const [x0, y0, cx, cy, x1, y1] = values;
    return Array.from({ length: 129 }, (_, index) => {
      const t = index / 128;
      const inverse = 1 - t;
      return {
        x: inverse * inverse * x0 + 2 * inverse * t * cx + t * t * x1,
        y: inverse * inverse * y0 + 2 * inverse * t * cy + t * t * y1,
      };
    });
  }
  const [x0, y0, x1, y1] = values;
  return Array.from({ length: 129 }, (_, index) => {
    const t = index / 128;
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
  });
}

function pointToSegmentDistance(point: Point, left: Point, right: Point): number {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - left.x, point.y - left.y);
  const position = Math.max(
    0,
    Math.min(
      1,
      ((point.x - left.x) * dx + (point.y - left.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (left.x + position * dx),
    point.y - (left.y + position * dy),
  );
}

function routeDistance(path: string, point: Point): number {
  const samples = sampledRoute(path);
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < samples.length; index += 1) {
    distance = Math.min(
      distance,
      pointToSegmentDistance(point, samples[index - 1], samples[index]),
    );
  }
  return distance;
}

describe("unexplored tree edge geometry", () => {
  it("curves the misleading tracking-to-boss edge away from equipment search", () => {
    const edge = buildUnexploredTreeModel(snapshot(), null).edges.find(
      ({ left, right }) => left === "deep-tracking" && right === "deep-boss",
    );
    const path = renderedPath(edge);

    expect(path).toContain(" Q ");
    expect(
      routeDistance(path!, UNEXPLORED_NODE_BY_ID.get("sector-medium-4")!),
    ).toBeGreaterThanOrEqual(31);
  });

  it("keeps collision-free edges straight", () => {
    const edge = buildUnexploredTreeModel(snapshot(), null).edges.find(
      ({ left, right }) => left === "start" && right === "inner-0-0",
    );

    expect(renderedPath(edge)).toContain(" L ");
  });

  it("keeps every rendered edge clear of every non-endpoint node", () => {
    const model = buildUnexploredTreeModel(snapshot(), null);

    for (const edge of model.edges) {
      const path = renderedPath(edge);
      expect(typeof path, `${edge.left} -> ${edge.right} has no route`).toBe(
        "string",
      );
      for (const node of UNEXPLORED_NODES) {
        if (node.id === edge.left || node.id === edge.right) continue;
        expect(
          routeDistance(path!, node),
          `${edge.left} -> ${edge.right} crosses ${node.id}`,
        ).toBeGreaterThanOrEqual(NODE_RADIUS[node.kind] + 6);
      }
    }
  });
});
