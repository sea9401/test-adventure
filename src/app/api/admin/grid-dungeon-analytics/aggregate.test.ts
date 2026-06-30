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
    exploredTiles: 1,
    hp: 0,
    supporterCount: 0,
    bossReached: false,
    combatCount: 0,
    totalCombatTurns: 0,
    durationMs: 0,
    message: "",
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
      bossReachRatePct: 50,
      avgCombatTurns: 15,
      avgRewardGold: 5000,
      avgMaterials: 2,
    });

    expect(data.recentRuns.map((r) => r.id)).toEqual(["a", "b", "c"]);
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
    expect(data.partySizes.find((p) => p.partySize === 2)?.clearRatePct).toBe(100);
    expect(data.partySizes.find((p) => p.partySize === 3)?.avgRewardGold).toBe(200);
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
