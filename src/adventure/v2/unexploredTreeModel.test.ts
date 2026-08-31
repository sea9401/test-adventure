import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_NODES,
  shortestUnexploredPath,
} from "@/adventure/data/v2/unexploredTree";
import {
  buildUnexploredTreeModel,
  type UnexploredClientSnapshot,
} from "./unexploredTreeModel";

function snapshot(
  overrides: Partial<UnexploredClientSnapshot> = {},
): UnexploredClientSnapshot {
  return {
    level: 100,
    eligible: true,
    earnedPoints: 3,
    spentPoints: 2,
    explorationXp: 10,
    xpPoints: 3,
    nextPointCost: 100,
    nextPointRemaining: 90,
    selectedNodeIds: ["start", "inner-0-0"],
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
    refundGoldCost: 50_000,
    ...overrides,
    summonStoneCraftCost: overrides.summonStoneCraftCost ?? {
      baseGoldCost: 1_000_000,
      goldCost: 1_000_000,
      liberationDiscountPct: 0,
    },
  };
}

describe("unexplored tree model", () => {
  it("maps all 160 nodes to active, available or locked states", () => {
    const model = buildUnexploredTreeModel(snapshot(), "inner-0-1");
    expect(model.nodes).toHaveLength(160);
    expect(model.nodes.filter((node) => node.state === "active")).toHaveLength(2);
    expect(model.nodes.some((node) => node.state === "available")).toBe(true);
    expect(model.nodes.some((node) => node.state === "locked")).toBe(true);
    expect(model.edges.length).toBeGreaterThan(0);
  });

  it("previews difficulty and the shortest comparison route for an available node", () => {
    const difficultyNode = UNEXPLORED_NODES.find((node) =>
      node.effects.some((effect) => effect.kind === "difficulty_reward"),
    )!;
    const selectedNodeIds = [
      ...new Set(
        buildUnexploredTreeModel(snapshot(), difficultyNode.id)
          .previewPath.slice(0, -1),
      ),
    ];
    const model = buildUnexploredTreeModel(
      snapshot({
        earnedPoints: 40,
        spentPoints: selectedNodeIds.length,
        selectedNodeIds,
      }),
      difficultyNode.id,
    );

    expect(model.selected?.id).toBe(difficultyNode.id);
    expect(model.selected?.state).toBe("available");
    expect(model.previewDifficulty).toBeGreaterThan(model.currentDifficulty);
    expect(model.previewPath.at(0)).toBe("start");
    expect(model.previewPath.at(-1)).toBe(difficultyNode.id);
  });

  it("summarizes only active special pools and exposes conversion nodes", () => {
    const model = buildUnexploredTreeModel(
      snapshot({
        encounterShares: [
          { kind: "base", share: 40 },
          { kind: "pool", poolId: "iron_legion", share: 30 },
          { kind: "pool", poolId: "mana_barrier", share: 30 },
        ],
      }),
      "deep-gold",
    );

    expect(model.poolSummary).toEqual([
      {
        poolId: "iron_legion",
        name: "철갑 군단",
        share: 30,
        materialName: "강화 철편",
        materialRateText: "1% · 집중 1.5%",
        weaponName: "철성 파쇄검",
        weaponRateText: "0.1% · 집중 0.2%",
      },
      {
        poolId: "mana_barrier",
        name: "마력 방벽체",
        share: 30,
        materialName: "방벽 결정",
        materialRateText: "1% · 집중 1.5%",
        weaponName: "결계 증폭봉",
        weaponRateText: "0.1% · 집중 0.2%",
      },
    ]);
    expect(model.selected?.categoryLabel).toBe("보상 전환");
  });

  it("잠긴 노드에 보상 전환 충돌 이유를 노출한다", () => {
    const selectedNodeIds = [
      ...new Set([
        ...buildUnexploredTreeModel(snapshot({ earnedPoints: 160 }), "deep-gold")
          .previewPath,
        ...buildUnexploredTreeModel(
          snapshot({ earnedPoints: 160 }),
          "deep-collector",
        ).previewPath.slice(0, -1),
      ]),
    ];
    const model = buildUnexploredTreeModel(
      snapshot({
        earnedPoints: 160,
        spentPoints: selectedNodeIds.length,
        selectedNodeIds,
      }),
      "deep-collector",
    );

    expect(model.selected?.state).toBe("locked");
    expect(model.selected?.activationError).toBe("conversion_conflict");
  });

  it("난이도 120을 넘기는 잠긴 노드에 상한 이유를 노출한다", () => {
    const difficultyIds = UNEXPLORED_NODES.filter((node) =>
      node.effects.some((effect) => effect.kind === "difficulty_reward"),
    ).map((node) => node.id);
    const finalDifficultyId = difficultyIds.at(-1)!;
    const selectedNodeIds = [
      ...new Set([
        ...shortestUnexploredPath("deep-contract"),
        ...difficultyIds
          .slice(0, -1)
          .flatMap((id) => shortestUnexploredPath(id)),
        ...shortestUnexploredPath(finalDifficultyId).slice(0, -1),
      ]),
    ];
    const model = buildUnexploredTreeModel(
      snapshot({
        earnedPoints: 160,
        spentPoints: selectedNodeIds.length,
        selectedNodeIds,
      }),
      finalDifficultyId,
    );

    expect(model.selected?.state).toBe("locked");
    expect(model.selected?.activationError).toBe("difficulty_cap");
  });

  it("locks every inactive node below level 100 without deleting progress", () => {
    const model = buildUnexploredTreeModel(
      snapshot({ level: 42, eligible: false }),
      "inner-0-1",
    );
    expect(model.nodes.find((node) => node.id === "start")?.state).toBe("active");
    expect(
      model.nodes
        .filter((node) => node.state !== "active")
        .every((node) => node.state === "locked"),
    ).toBe(true);
  });
});
