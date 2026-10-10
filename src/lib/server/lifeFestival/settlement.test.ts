import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  weekRows: [] as Record<string, unknown>[],
  scoreRows: [] as Record<string, unknown>[],
  pendingRows: [] as Record<string, unknown>[],
  inserts: [] as { table: unknown; values: unknown }[],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const thenable = (rows: () => unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["where", "for", "innerJoin", "leftJoin", "orderBy", "limit"]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(rows()).then(resolve, reject);
    return chain;
  };
  const executor = {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        state.inserts.push({ table, values });
        const result = Promise.resolve();
        return Object.assign(result, { onConflictDoNothing: async () => undefined });
      },
    }),
    select: () => ({
      from: (table: unknown) =>
        thenable(() => (table === schema.lifeFestivalWeeks ? state.weekRows : state.scoreRows)),
    }),
    selectDistinct: () => ({ from: () => thenable(() => state.pendingRows) }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    }),
  };
  return {
    db: {
      ...executor,
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(executor)),
    },
  };
});

import { marketplaceInbox } from "@/db/schema";
import {
  grantLifeFestivalWeekRewards,
  grantPendingLifeFestivalRewards,
} from "./settlement";

const NOW = new Date("2026-10-12T00:10:00+09:00");

function score(userId: string, value: number, bannedUntil: Date | null = null) {
  return { userId, score: value, updatedAt: new Date("2026-10-10T00:00:00Z"), bannedUntil };
}

function inboxInserts() {
  return state.inserts
    .filter((insert) => insert.table === marketplaceInbox)
    .map((insert) => insert.values as { userId: string; kind: string; payload: Record<string, unknown>; message: string });
}

beforeEach(() => {
  state.weekRows = [{ id: "2026-10-05", rewardsGrantedAt: null }];
  state.scoreRows = [];
  state.pendingRows = [];
  state.inserts = [];
  state.updates = [];
});

describe("생활 축제 주간 정산", () => {
  it("순위 보상을 생활 축제 시즌 우편으로 보내고 정산을 표시한다", async () => {
    state.scoreRows = [score("b", 50), score("a", 90), score("c", 10, new Date("2099-01-01T00:00:00Z"))];

    const result = await grantLifeFestivalWeekRewards("2026-10-05", NOW);

    expect(result).toEqual({ kind: "ok", weekId: "2026-10-05", winners: 2, total: 160 });
    expect(inboxInserts().map((insert) => [insert.userId, insert.kind, insert.payload])).toEqual([
      ["a", "season_reward", { season: "life_festival", coins: 100, rank: 1 }],
      ["b", "season_reward", { season: "life_festival", coins: 60, rank: 2 }],
    ]);
    expect(inboxInserts()[0].message).toBe("생활 축제 주간 순위 보상 (1위 · 증표 100개)");
    expect(state.updates).toEqual([
      { rewardsGrantedAt: NOW, winners: 2, totalTokens: 160 },
    ]);
  });

  it("이미 정산한 주는 다시 지급하지 않는다", async () => {
    state.weekRows = [{ id: "2026-10-05", rewardsGrantedAt: new Date("2026-10-12T00:01:00+09:00") }];
    state.scoreRows = [score("a", 90)];

    const result = await grantLifeFestivalWeekRewards("2026-10-05", NOW);

    expect(result).toEqual({ kind: "already", weekId: "2026-10-05" });
    expect(inboxInserts()).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it("미정산 대상에서 현재 주는 제외한다", async () => {
    state.pendingRows = [{ weekId: "2026-10-05" }, { weekId: "2026-10-12" }];
    state.scoreRows = [score("a", 90)];

    const { results } = await grantPendingLifeFestivalRewards(NOW);

    expect(results.map((result) => result.weekId)).toEqual(["2026-10-05"]);
  });
});
