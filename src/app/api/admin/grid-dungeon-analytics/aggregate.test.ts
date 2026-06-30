import { describe, expect, it } from "vitest";
import {
  aggregateGridDungeonAnalytics,
  filterGridDungeonAnalyticsUsers,
  type GridDungeonAnalyticsUser,
} from "./aggregate";
import type { GridDungeonHistoryEntry } from "@/adventure/data/v2/gridDungeon";

function entry(
  p: Partial<GridDungeonHistoryEntry> & {
    id: string;
    outcome: GridDungeonHistoryEntry["outcome"];
  },
): GridDungeonHistoryEntry {
  return {
    routeId: "balanced",
    at: 1_000,
    rewardGold: 0,
    drops: {},
    materialCount: 0,
    rewardLimited: false,
    exploredTiles: 1,
    hp: 0,
    supporterCount: 0,
    bossReached: false,
    combatCount: 0,
    totalCombatTurns: 0,
    durationMs: 0,
    message: "",
    detailReason: "",
    ...p,
  };
}

function user(p: Partial<GridDungeonAnalyticsUser>): GridDungeonAnalyticsUser {
  return {
    userId: "u1",
    name: "모험가",
    history: [],
    ...p,
  };
}

describe("aggregateGridDungeonAnalytics", () => {
  it("returns empty route buckets and admin metadata for no histories", () => {
    const data = aggregateGridDungeonAnalytics([], { adminExcluded: 2 });

    expect(data.summary.runs).toBe(0);
    expect(data.summary.adminExcluded).toBe(2);
    expect(data.summary.clearRatePct).toBe(0);
    expect(data.routes).toHaveLength(3);
    expect(data.routes.every((r) => r.runs === 0)).toBe(true);
    expect(data.partySizes).toEqual([]);
    expect(data.routeParties).toHaveLength(9);
    expect(data.failureReasons).toEqual([]);
    expect(data.balanceFlags).toEqual([]);
    expect(data.tuningCandidates).toEqual([]);
    expect(data.recentRuns).toEqual([]);
  });

  it("aggregates route outcomes, boss reach, rewards, and turns", () => {
    const data = aggregateGridDungeonAnalytics([
      user({
        userId: "u1",
        name: "알파",
        history: [
          entry({
            id: "a",
            outcome: "cleared",
            routeId: "guardian",
            at: 3_000,
            rewardGold: 10_000,
            drops: { stone: 2, iron: 1 },
            hp: 72,
            supporterCount: 2,
            bossReached: true,
            combatCount: 4,
            totalCombatTurns: 20,
            durationMs: 60_000,
          }),
          entry({
            id: "b",
            outcome: "failed",
            routeId: "guardian",
            at: 2_000,
            supporterCount: 0,
            bossReached: false,
            combatCount: 2,
            totalCombatTurns: 9,
            durationMs: 30_000,
          }),
        ],
      }),
      user({
        userId: "u2",
        name: "베타",
        history: [
          entry({
            id: "c",
            outcome: "abandoned",
            routeId: "vault",
            at: 1_000,
            hp: 14,
            supporterCount: 1,
            bossReached: true,
            totalCombatTurns: 3,
            durationMs: 15_000,
          }),
        ],
      }),
    ]);

    expect(data.summary).toMatchObject({
      users: 2,
      usersWithHistory: 2,
      runs: 3,
      cleared: 1,
      failed: 1,
      abandoned: 1,
      clearRatePct: 33,
      bossReachRatePct: 67,
      avgCombatTurns: 11,
      avgRemainingHp: 29,
      avgPartySize: 2,
      avgRewardGold: 3333,
      avgMaterials: 1,
      avgDurationSec: 35,
    });

    const guardian = data.routes.find((r) => r.routeId === "guardian");
    expect(guardian).toMatchObject({
      runs: 2,
      cleared: 1,
      failed: 1,
      clearRatePct: 50,
      failureRatePct: 50,
      bossReachRatePct: 50,
      avgRemainingHp: 36,
      avgCombatTurns: 15,
      avgRewardGold: 5000,
      avgMaterials: 2,
      riskLevel: "low_sample",
      riskLabel: "표본 부족",
    });

    const guardianTrio = data.routeParties.find(
      (r) => r.routeId === "guardian" && r.partySize === 3,
    );
    expect(guardianTrio).toMatchObject({
      runs: 1,
      cleared: 1,
      avgRemainingHp: 72,
    });

    expect(data.recentRuns.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("aggregates failure reasons and exposes recent run detail", () => {
    const data = aggregateGridDungeonAnalytics([
      user({
        history: [
          entry({
            id: "boss",
            outcome: "failed",
            failureReason: "combat_boss",
            detailReason: "보스 전투 패배",
          }),
          entry({
            id: "trap",
            outcome: "failed",
            failureReason: "trap",
            detailReason: "함정 피해로 HP 소진",
          }),
          entry({
            id: "clear",
            outcome: "cleared",
          }),
        ],
      }),
    ]);

    expect(data.failureReasons).toEqual([
      {
        reason: "combat_boss",
        label: "보스 전투 패배",
        runs: 1,
        pctOfFailures: 50,
      },
      {
        reason: "trap",
        label: "함정 HP 소진",
        runs: 1,
        pctOfFailures: 50,
      },
    ]);
    expect(data.recentRuns.find((run) => run.id === "boss")).toMatchObject({
      failureReason: "combat_boss",
      failureReasonLabel: "보스 전투 패배",
      detailReason: "보스 전투 패배",
    });
  });

  it("groups by actual party size", () => {
    const data = aggregateGridDungeonAnalytics([
      user({
        history: [
          entry({ id: "solo", outcome: "failed", supporterCount: 0 }),
          entry({
            id: "duo",
            outcome: "cleared",
            supporterCount: 1,
            rewardGold: 100,
          }),
          entry({
            id: "trio",
            outcome: "cleared",
            supporterCount: 2,
            rewardGold: 200,
          }),
        ],
      }),
    ]);

    expect(data.partySizes.map((p) => p.partySize)).toEqual([1, 2, 3]);
    expect(data.partySizes.find((p) => p.partySize === 1)?.clearRatePct).toBe(0);
    expect(data.partySizes.find((p) => p.partySize === 1)?.failureRatePct).toBe(
      100,
    );
    expect(data.partySizes.find((p) => p.partySize === 2)?.clearRatePct).toBe(100);
    expect(data.partySizes.find((p) => p.partySize === 3)?.avgRewardGold).toBe(200);
  });

  it("builds route-party risk flags and tuning candidates", () => {
    const hardRuns = Array.from({ length: 5 }, (_, index) =>
      entry({
        id: `hard-${index}`,
        outcome: "failed",
        routeId: "balanced",
        hp: 0,
        supporterCount: 0,
        bossReached: false,
        combatCount: 3,
        totalCombatTurns: 18,
        durationMs: 45_000,
      }),
    );
    const easyRuns = Array.from({ length: 5 }, (_, index) =>
      entry({
        id: `easy-${index}`,
        outcome: "cleared",
        routeId: "vault",
        hp: 80,
        supporterCount: 2,
        bossReached: true,
        rewardGold: 1_000,
        combatCount: 2,
        totalCombatTurns: 8,
        durationMs: 30_000,
      }),
    );

    const data = aggregateGridDungeonAnalytics([
      user({ userId: "hard", history: hardRuns }),
      user({ userId: "easy", history: easyRuns }),
    ]);

    expect(data.routeParties).toHaveLength(9);
    expect(
      data.routeParties.find(
        (r) => r.routeId === "balanced" && r.partySize === 1,
      ),
    ).toMatchObject({
      runs: 5,
      failed: 5,
      clearRatePct: 0,
      failureRatePct: 100,
      riskLevel: "too_hard",
    });
    expect(
      data.routeParties.find((r) => r.routeId === "vault" && r.partySize === 3),
    ).toMatchObject({
      runs: 5,
      cleared: 5,
      clearRatePct: 100,
      bossReachRatePct: 100,
      avgRemainingHp: 80,
      riskLevel: "too_easy",
    });
    expect(data.balanceFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route:balanced:hard",
          severity: "danger",
        }),
        expect.objectContaining({
          id: "route:vault:easy",
          severity: "warning",
        }),
      ]),
    );
    expect(data.tuningCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route:balanced:soften",
          priority: "high",
        }),
        expect.objectContaining({
          id: "route:vault:tighten",
          priority: "medium",
        }),
      ]),
    );
  });

  it("filters users and histories by query and date", () => {
    const users = [
      user({
        userId: "u-alpha",
        name: "알파",
        history: [
          entry({ id: "old", outcome: "cleared", at: 1_000 }),
          entry({ id: "new", outcome: "failed", at: 5_000 }),
        ],
      }),
      user({
        userId: "u-beta",
        name: "베타",
        history: [entry({ id: "beta", outcome: "cleared", at: 5_000 })],
      }),
    ];

    const filtered = filterGridDungeonAnalyticsUsers(users, {
      query: "alpha",
      sinceAt: 3_000,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.userId).toBe("u-alpha");
    expect(filtered[0]?.history.map((e) => e.id)).toEqual(["new"]);

    const data = aggregateGridDungeonAnalytics(
      users,
      { adminExcluded: 0 },
      { query: "베타", sinceAt: 3_000 },
    );
    expect(data.summary.users).toBe(1);
    expect(data.summary.runs).toBe(1);
    expect(data.recentRuns[0]?.id).toBe("beta");
  });
});
