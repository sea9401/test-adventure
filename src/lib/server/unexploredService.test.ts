import { describe, expect, it } from "vitest";
import { UNEXPLORED_NODES, shortestUnexploredPath } from "@/adventure/data/v2/unexploredTree";
import { parseUnexploredSave } from "@/adventure/data/v2/unexploredState";
import {
  applyUnexploredMutation,
  unexploredSnapshot,
} from "./unexploredService";

function character(overrides: Record<string, unknown> = {}) {
  return {
    level: 100,
    gold: 1_000_000,
    bankedGold: 0,
    unexplored: parseUnexploredSave({ xpPoints: 30 }),
    ...overrides,
  };
}

describe("unexplored service", () => {
  it("builds a server-authoritative snapshot", () => {
    const snapshot = unexploredSnapshot(character({
      unexplored: parseUnexploredSave({
        explorationXp: 123,
        explorationProgressVersion: 2,
        xpPoints: 3,
        selectedNodeIds: ["start", "inner-0-0"],
        traces: { iron_legion: 9 },
      }),
    }));

    expect(snapshot).toMatchObject({
      level: 100,
      eligible: true,
      earnedPoints: 3,
      spentPoints: 2,
      explorationXp: 123,
      selectedNodeIds: ["start", "inner-0-0"],
      difficulty: 95,
      traces: { iron_legion: 9 },
    });
    expect(snapshot.nextPointCost).toBeGreaterThan(0);
    expect(snapshot.encounterShares).toEqual([{ kind: "base", share: 100 }]);
  });

  it("rejects low level, unknown, non-adjacent and point-starved activation", () => {
    expect(
      applyUnexploredMutation(character({ level: 99 }), {
        action: "activate",
        nodeId: "start",
      }),
    ).toMatchObject({ ok: false, error: "level_required" });
    expect(
      applyUnexploredMutation(character(), {
        action: "activate",
        nodeId: "unknown",
      }),
    ).toMatchObject({ ok: false, error: "unknown_node" });
    expect(
      applyUnexploredMutation(character({
        unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: ["start"] }),
      }), { action: "activate", nodeId: "deep-boss" }),
    ).toMatchObject({ ok: false, error: "not_adjacent" });
    expect(
      applyUnexploredMutation(character({
        unexplored: parseUnexploredSave({ selectedNodeIds: ["start"] }),
      }), { action: "activate", nodeId: "inner-0-0" }),
    ).toMatchObject({ ok: false, error: "point_limit" });
  });

  it("rejects conversion conflicts and opens the boss path at difficulty 120", () => {
    const goldPath = shortestUnexploredPath("deep-gold");
    const collectorPath = shortestUnexploredPath("deep-collector");
    const conversionSelected = [
      ...new Set([...goldPath, ...collectorPath.slice(0, -1)]),
    ];
    expect(
      applyUnexploredMutation(character({
        unexplored: parseUnexploredSave({
          xpPoints: 30,
          achievementIds: [
            "first_personal_boss", "defeat_tracking_weapon",
            "defeat_toxic_blood_lord", "defeat_glacial_colossus",
            "defeat_all_personal_bosses", "first_unexplored_hunt", "first_special_kill",
            "first_summon_stone_craft", "activate_two_pools", "activate_three_pools",
          ],
          selectedNodeIds: conversionSelected,
        }),
      }), { action: "activate", nodeId: "deep-collector" }),
    ).toMatchObject({ ok: false, error: "conversion_conflict" });

    const upperPath = shortestUnexploredPath("outer-medium-8");
    const lowerEntry = shortestUnexploredPath("sector-medium-6");
    const selectedNodeIds = [
      ...new Set([
        ...upperPath,
        ...lowerEntry,
        ...Array.from({ length: 6 }, (_, index) => `outer-medium-${index}`),
      ]),
    ];
    const result = applyUnexploredMutation(character({
      unexplored: parseUnexploredSave({
        xpPoints: 30,
        achievementIds: [
          "first_personal_boss", "defeat_tracking_weapon",
          "defeat_toxic_blood_lord", "defeat_glacial_colossus",
          "defeat_all_personal_bosses",
        ],
        selectedNodeIds,
      }),
    }), { action: "activate", nodeId: "deep-boss" });
    expect(result).toMatchObject({ ok: true, snapshot: { difficulty: 120 } });
    if (result.ok) expect(result.snapshot.selectedNodeIds).toContain("deep-boss");
  });

  it("activates a valid node and grants permanent pool-count achievements", () => {
    const firstPath = shortestUnexploredPath("pool-iron_legion");
    const secondPath = shortestUnexploredPath("pool-mana_barrier");
    const selected = [...new Set([...firstPath, ...secondPath.slice(0, -1)])];
    const result = applyUnexploredMutation(character({
      unexplored: parseUnexploredSave({
        xpPoints: 30,
        selectedNodeIds: selected,
      }),
    }), { action: "activate", nodeId: "pool-mana_barrier" });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected success");
    expect(result.character.unexplored.selectedNodeIds).toContain("pool-mana_barrier");
    expect(result.character.unexplored.achievementIds).toContain("activate_two_pools");
    expect(result.snapshot.encounterShares).toEqual([
      { kind: "base", share: 60 },
      { kind: "pool", poolId: "iron_legion", share: 20 },
      { kind: "pool", poolId: "mana_barrier", share: 20 },
    ]);
  });

  it("atomically activates every missing node on the shortest route", () => {
    const result = applyUnexploredMutation(character({
      unexplored: parseUnexploredSave({
        xpPoints: 30,
        selectedNodeIds: ["start", "inner-0-0"],
      }),
    }), { action: "activate_path", nodeId: "pool-iron_legion" });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected success");
    expect(result.character.unexplored.selectedNodeIds).toEqual(
      shortestUnexploredPath("pool-iron_legion"),
    );
    expect(result.snapshot.spentPoints).toBe(9);
  });

  it("charges every node in the minimum batch refund closure", () => {
    const selected = shortestUnexploredPath("route-b-0");
    const result = applyUnexploredMutation(character({
      gold: 1_000_000,
      unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: selected }),
    }), { action: "refund_path", nodeId: "route-a-0" });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected success");
    expect(result.character.gold).toBe(0);
    expect(result.character.unexplored.selectedNodeIds).toEqual(
      selected.filter((nodeId) => !["route-a-0", "route-b-0"].includes(nodeId)),
    );
  });

  it("rejects a batch refund without changing any node when total gold is short", () => {
    const selected = shortestUnexploredPath("route-b-0");
    const original = character({
      gold: 999_999,
      unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: selected }),
    });
    const result = applyUnexploredMutation(original, {
      action: "refund_path",
      nodeId: "route-a-0",
    });

    expect(result).toEqual({ ok: false, error: "insufficient_gold" });
    expect(original.gold).toBe(999_999);
    expect(parseUnexploredSave(original.unexplored).selectedNodeIds).toEqual(selected);
  });

  it("charges 500,000G per refund and blocks start/disconnecting refunds", () => {
    const path = shortestUnexploredPath("deep-boss");
    expect(
      applyUnexploredMutation(character({
        unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: path }),
      }), { action: "refund", nodeId: "start" }),
    ).toMatchObject({ ok: false, error: "start_required" });
    expect(
      applyUnexploredMutation(character({
        unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: path }),
      }), { action: "refund", nodeId: path.at(-2)! }),
    ).toMatchObject({ ok: false, error: "would_disconnect" });
    expect(
      applyUnexploredMutation(character({
        gold: 499_999,
        unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: path }),
      }), { action: "refund", nodeId: "deep-boss" }),
    ).toMatchObject({ ok: false, error: "insufficient_gold" });

    const success = applyUnexploredMutation(character({
      gold: 500_000,
      unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: path }),
    }), { action: "refund", nodeId: "deep-boss" });
    expect(success).toMatchObject({ ok: true });
    if (!success.ok) throw new Error("expected success");
    expect(success.character.gold).toBe(0);
    expect(success.character.unexplored.selectedNodeIds).not.toContain("deep-boss");
  });

  it("resets to start for 500,000G per returned node", () => {
    const selected = shortestUnexploredPath("pool-iron_legion");
    const refundable = selected.length - 1;
    const result = applyUnexploredMutation(character({
      gold: refundable * 500_000,
      unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: selected }),
    }), { action: "reset" });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected success");
    expect(result.character.gold).toBe(0);
    expect(result.character.unexplored.selectedNodeIds).toEqual(["start"]);
    expect(result.snapshot.spentPoints).toBe(1);
  });

  it("reorders which risk node fills the 130 cap for free and keeps the preset in sync", () => {
    const difficultyIds = UNEXPLORED_NODES.filter((node) =>
      node.effects.some((effect) => effect.kind === "difficulty_reward"),
    ).map((node) => node.id);
    const selectedNodeIds = ["start", "deep-contract", ...difficultyIds];
    const lastId = difficultyIds.at(-1)!;
    const result = applyUnexploredMutation(character({
      unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds }),
    }), { action: "difficulty_order", nodeId: lastId, placement: "first" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character.gold).toBe(1_000_000);
    expect(result.character.unexplored.selectedNodeIds.slice(0, 2)).toEqual(["start", lastId]);
    expect(result.character.unexplored.nodePresets[0]).toEqual(
      result.character.unexplored.selectedNodeIds,
    );
    expect(result.snapshot.difficulty).toBe(130);
    expect(result.snapshot.effects.difficultyApplication[lastId]).toEqual({ applied: 4, total: 4 });

    expect(
      applyUnexploredMutation(character({
        unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds: ["start", "inner-0-0"] }),
      }), { action: "difficulty_order", nodeId: "inner-0-0", placement: "last" }),
    ).toMatchObject({ ok: false, error: "not_difficulty_node" });
    expect(
      applyUnexploredMutation(character({ level: 99 }), {
        action: "difficulty_order",
        nodeId: lastId,
        placement: "first",
      }),
    ).toMatchObject({ ok: false, error: "level_required" });
  });

  it("최대 난이도를 골드 없이 바꾸고 프리셋마다 따로 기억한다", () => {
    const difficultyIds = UNEXPLORED_NODES.filter((node) =>
      node.effects.some((effect) => effect.kind === "difficulty_reward"),
    ).map((node) => node.id);
    const selectedNodeIds = ["start", ...difficultyIds];
    const start = character({
      unexplored: parseUnexploredSave({ xpPoints: 30, selectedNodeIds }),
    });
    expect(unexploredSnapshot(start)).toMatchObject({
      difficulty: 130,
      difficultyCap: 130,
    });

    const lowered = applyUnexploredMutation(start, {
      action: "difficulty_cap",
      cap: 120,
    });
    expect(lowered.ok).toBe(true);
    if (!lowered.ok) return;
    expect(lowered.character.gold).toBe(1_000_000);
    expect(lowered.character.unexplored.difficultyCaps).toEqual([120, 130, 130]);
    expect(lowered.character.unexplored.selectedNodeIds).toEqual(selectedNodeIds);
    expect(lowered.snapshot).toMatchObject({
      difficulty: 120,
      difficultyIncrease: 25,
      difficultyCap: 120,
    });
    expect(lowered.snapshot.rewardSummary.specialMaterial).toBeLessThan(
      unexploredSnapshot(start).rewardSummary.specialMaterial,
    );

    const switched = applyUnexploredMutation(lowered.character, {
      action: "switch_preset",
      presetIndex: 1,
    });
    expect(switched.ok).toBe(true);
    if (!switched.ok) return;
    expect(switched.snapshot.difficultyCap).toBe(130);
    const back = applyUnexploredMutation(switched.character, {
      action: "switch_preset",
      presetIndex: 0,
      expectedPresetIndex: 1,
    });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.snapshot).toMatchObject({ difficulty: 120, difficultyCap: 120 });
  });

  it("고를 수 없는 최대 난이도와 100레벨 미만의 변경을 거절한다", () => {
    for (const cap of [119, 131, 124.5]) {
      expect(
        applyUnexploredMutation(character(), { action: "difficulty_cap", cap }),
      ).toEqual({ ok: false, error: "invalid_difficulty_cap" });
    }
    expect(
      applyUnexploredMutation(character({ level: 99 }), {
        action: "difficulty_cap",
        cap: 120,
      }),
    ).toEqual({ ok: false, error: "level_required" });
  });

  it("catalogue fixture still contains nodes used by the service tests", () => {
    expect(UNEXPLORED_NODES.some((node) => node.id === "sector-medium-5")).toBe(true);
  });
});
