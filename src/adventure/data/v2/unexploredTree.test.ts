import { describe, expect, it } from "vitest";
import {
  BOSS_UNEXPLORED_POOL_IDS,
  FRONT_UNEXPLORED_POOL_IDS,
  UNEXPLORED_EDGES,
  UNEXPLORED_NODES,
  deriveUnexploredEffects,
  shortestUnexploredPath,
  unexploredActivationPath,
  unexploredActivationError,
  unexploredRefundPath,
  unexploredRefundError,
} from "./unexploredTree";

describe("unexplored tree catalogue", () => {
  it("keeps the approved 160-node composition", () => {
    const counts = Object.fromEntries(
      ["start", "small", "medium", "pool", "enhancer", "deep"].map(
        (kind) => [
          kind,
          UNEXPLORED_NODES.filter((node) => node.kind === kind).length,
        ],
      ),
    );

    expect(UNEXPLORED_NODES).toHaveLength(160);
    expect(counts).toEqual({
      start: 1,
      small: 72,
      medium: 21,
      pool: 12,
      enhancer: 48,
      deep: 6,
    });
    expect(new Set(UNEXPLORED_NODES.map((node) => node.id)).size).toBe(160);
  });

  it("keeps the doubled reward values for every small node", () => {
    const expectedPct = {
      gold: 1,
      base_material: 2,
      equipment: 2,
      quality: 2,
      special_material: 2,
    } as const;
    const smallNodes = UNEXPLORED_NODES.filter((node) => node.kind === "small");

    for (const node of smallNodes) {
      expect(node.effects).toHaveLength(1);
      const effect = node.effects[0];
      expect(effect.kind).toBe("reward");
      if (effect.kind !== "reward") continue;
      expect(effect.pct).toBe(expectedPct[effect.reward]);
    }

    expect(deriveUnexploredEffects(smallNodes.map((node) => node.id)).rewardPct)
      .toEqual({
        gold: 18,
        baseMaterial: 36,
        equipment: 28,
        quality: 20,
        specialMaterial: 24,
        rare: 0,
      });
  });

  it("keeps every node reachable at the approved minimum depths", () => {
    for (const node of UNEXPLORED_NODES) {
      expect(shortestUnexploredPath(node.id).at(0)).toBe("start");
      expect(shortestUnexploredPath(node.id).at(-1)).toBe(node.id);
    }

    const depth = (id: string) => shortestUnexploredPath(id).length - 1;
    const poolDepths = UNEXPLORED_NODES.filter((node) => node.kind === "pool")
      .map((node) => depth(node.id));
    const enhancerDepths = UNEXPLORED_NODES.filter(
      (node) => node.kind === "enhancer",
    ).map((node) => depth(node.id));
    const deepDepths = UNEXPLORED_NODES.filter((node) => node.kind === "deep")
      .map((node) => depth(node.id));

    expect(Math.min(...poolDepths)).toBeGreaterThanOrEqual(6);
    expect(Math.min(...poolDepths)).toBeLessThanOrEqual(8);
    expect(Math.min(...enhancerDepths)).toBeGreaterThanOrEqual(9);
    expect(Math.min(...deepDepths)).toBeGreaterThanOrEqual(18);
    expect(depth("deep-boss")).toBeGreaterThanOrEqual(24);
  });

  it("uses loot search for the front six pools and trace search for the boss six", () => {
    for (const poolId of FRONT_UNEXPLORED_POOL_IDS) {
      const node = UNEXPLORED_NODES.find(
        (candidate) => candidate.id === `enh-${poolId}-loot`,
      );
      expect(node?.effects).toEqual([
        { kind: "pool_loot", poolId, pct: 20 },
      ]);
    }
    for (const poolId of BOSS_UNEXPLORED_POOL_IDS) {
      const node = UNEXPLORED_NODES.find(
        (candidate) => candidate.id === `enh-${poolId}-trace`,
      );
      expect(node?.effects).toEqual([
        { kind: "pool_trace", poolId, extraChancePct: 20 },
      ]);
    }
  });

  it("adds the fourteen difficulty nodes to +35 and derives their literal rewards", () => {
    const difficultyNodeIds = UNEXPLORED_NODES.filter((node) =>
      node.effects.some((effect) => effect.kind === "difficulty_reward"),
    ).map((node) => node.id);
    const effects = deriveUnexploredEffects(difficultyNodeIds);

    expect(difficultyNodeIds).toHaveLength(14);
    expect(effects.difficultyIncrease).toBe(35);
    expect(effects.difficulty).toBe(120);
    expect(effects.rewardPct).toMatchObject({
      gold: 30,
      baseMaterial: 65,
      equipment: 65,
      specialMaterial: 115,
    });
    expect(effects.traceExtraChancePct).toBe(65);
    expect(effects.rareCopyChancePct).toBe(55);
  });

  it("rejects a second conversion node and selections above difficulty 120", () => {
    const goldPath = shortestUnexploredPath("deep-gold");
    const collectorPath = shortestUnexploredPath("deep-collector");
    const selected = [...new Set([...goldPath, ...collectorPath.slice(0, -1)])];
    expect(
      unexploredActivationError(selected, "deep-collector", 160),
    ).toBe("conversion_conflict");

    const difficultyIds = UNEXPLORED_NODES.filter((node) =>
      node.effects.some((effect) => effect.kind === "difficulty_reward"),
    ).map((node) => node.id);
    const finalDifficultyId = difficultyIds.at(-1)!;
    const contractPath = shortestUnexploredPath("deep-contract");
    const overCapSelected = [
      ...new Set([
        ...contractPath,
        ...difficultyIds
          .slice(0, -1)
          .flatMap((id) => shortestUnexploredPath(id)),
        ...shortestUnexploredPath(finalDifficultyId).slice(0, -1),
      ]),
    ];
    expect(
      deriveUnexploredEffects([...overCapSelected, finalDifficultyId])
        .difficultyIncrease,
    ).toBe(40);
    expect(
      unexploredActivationError(overCapSelected, finalDifficultyId, 160),
    ).toBe("difficulty_cap");
  });

  it("requires an active neighbour and prevents refunds that disconnect the tree", () => {
    expect(unexploredActivationError(["start"], "deep-boss", 40)).toBe(
      "not_adjacent",
    );

    const path = shortestUnexploredPath("deep-boss");
    expect(path.length).toBeGreaterThan(2);
    expect(unexploredRefundError(path, path.at(-2)!)).toBe(
      "would_disconnect",
    );
    expect(unexploredRefundError(path, path.at(-1)!)).toBeNull();
    expect(unexploredRefundError(path, "start")).toBe("start_required");
  });

  it("plans every inactive node on the shortest route in activation order", () => {
    expect(
      unexploredActivationPath(
        ["start", "inner-0-0"],
        "pool-iron_legion",
        9,
      ),
    ).toEqual({
      ok: true,
      nodeIds: [
        "inner-1-0",
        "inner-2-0",
        "inner-3-0",
        "inner-4-0",
        "inner-5-0",
        "inner-6-0",
        "pool-iron_legion",
      ],
    });
  });

  it("starts an activation route from the nearest active node", () => {
    expect(
      unexploredActivationPath(
        ["start", "inner-0-0", "inner-1-0"],
        "inner-1-1",
        160,
      ),
    ).toEqual({
      ok: true,
      nodeIds: ["inner-1-1"],
    });
  });

  it("rejects the whole activation route when an intermediate constraint fails", () => {
    expect(
      unexploredActivationPath(
        ["start", "inner-0-0"],
        "pool-iron_legion",
        3,
      ),
    ).toEqual({ ok: false, error: "point_limit" });

    const goldPath = shortestUnexploredPath("deep-gold");
    const collectorPath = shortestUnexploredPath("deep-collector");
    const selected = [
      ...new Set([...goldPath, ...collectorPath.slice(0, -1)]),
    ];
    expect(
      unexploredActivationPath(selected, "deep-collector", 160),
    ).toEqual({ ok: false, error: "conversion_conflict" });
  });

  it("plans the minimum refund closure while preserving nodes with another route to start", () => {
    const singleRoute = shortestUnexploredPath("route-b-0");
    expect(unexploredRefundPath(singleRoute, "route-a-0")).toEqual({
      ok: true,
      nodeIds: ["route-b-0", "route-a-0"],
    });

    const alternateRoute = [
      ...new Set([
        ...singleRoute,
        ...shortestUnexploredPath("route-b-1"),
        "shared-0",
      ]),
    ];
    expect(unexploredRefundPath(alternateRoute, "route-a-0")).toEqual({
      ok: true,
      nodeIds: ["route-a-0"],
    });
  });

  it("keeps start and inactive nodes out of batch refund plans", () => {
    const selected = shortestUnexploredPath("pool-iron_legion");
    expect(unexploredRefundPath(selected, "start")).toEqual({
      ok: false,
      error: "start_required",
    });
    expect(unexploredRefundPath(selected, "pool-mana_barrier")).toEqual({
      ok: false,
      error: "not_active",
    });
  });

  it("does not contain duplicate or dangling edges", () => {
    const ids = new Set(UNEXPLORED_NODES.map((node) => node.id));
    const edgeKeys = UNEXPLORED_EDGES.map(([left, right]) =>
      [left, right].sort().join("|"),
    );
    expect(new Set(edgeKeys).size).toBe(edgeKeys.length);
    for (const [left, right] of UNEXPLORED_EDGES) {
      expect(ids.has(left)).toBe(true);
      expect(ids.has(right)).toBe(true);
      expect(left).not.toBe(right);
    }
  });
});
