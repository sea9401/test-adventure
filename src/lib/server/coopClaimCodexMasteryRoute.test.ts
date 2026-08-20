import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "./codexMasteryGameplay";

const {
  forceUnique,
  forResults,
  limitResults,
  recordCodexMasteryGameplayBatch,
  store,
} = vi.hoisted(() => ({
  forceUnique: { value: true },
  forResults: [] as unknown[][],
  limitResults: [] as unknown[][],
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-coop-claim"),
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
}));
vi.mock("@/lib/server/guildExplorationWeekly", () => ({
  incrementGuildExplorationCoopProgress: vi.fn(async () => null),
}));
vi.mock("@/adventure/data/v2/coopBosses", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/data/v2/coopBosses")
  >();
  return {
    ...actual,
    rollCoopUnique: vi.fn(() => forceUnique.value),
  };
});
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));
vi.mock("@/db", () => {
  const tx = {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: async () => limitResults.shift() ?? [],
        for: async () => forResults.shift() ?? [],
      };
      return chain;
    },
    update: () => ({
      set: () => ({ where: async () => undefined }),
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (callback: (executor: unknown) => unknown) => callback(tx)),
    },
  };
});

import { POST } from "@/app/api/v2/coop/claim/route";
import { COOP_BOSSES } from "@/adventure/data/v2/coopBosses";

function request(): Request {
  return new Request("http://test/api/v2/coop/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "session-1" }),
  });
}

function seedClaim(claimedAt: Date | null = null) {
  store.set("character.v2", { materials: {} });
  store.set("equipment.v2", { owned: [], equipped: {} });
  store.set("adventure-log.v2", {});
  limitResults.push([{
    id: "session-1",
    regionId: "mountain_chief",
    defeatedAt: new Date("2026-08-20T00:00:00.000Z"),
    hp: 0,
    maxHp: 1_000,
  }]);
  forResults.push([{
    sessionId: "session-1",
    userId: "u-coop-claim",
    damage: 1_000,
    claimedAt,
    claimedRewardSnapshot: claimedAt ? { tier: "legend" } : null,
  }]);
}

describe("coop claim codex mastery", () => {
  beforeEach(() => {
    store.clear();
    limitResults.length = 0;
    forResults.length = 0;
    forceUnique.value = true;
    recordCodexMasteryGameplayBatch.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  it("records a newly granted boss signature unique exactly once", async () => {
    // Break caught: the contributor claim is marked and unique equipment is owned without acquisition mastery.
    seedClaim();
    limitResults.push([]);
    const expectedId = COOP_BOSSES.mountain_chief.uniqueIds[0];

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      alreadyClaimed: false,
      reward: { uniqueId: expectedId },
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-coop-claim",
      [{
        category: "equipment",
        entryId: expectedId,
        amount: 1,
        source: "equipment.drop",
      }],
      expect.any(Date),
    );
  });

  it("does not record an already-claimed retry or a claim without a unique", async () => {
    seedClaim(new Date("2026-08-20T00:01:00.000Z"));

    const retry = await POST(request());

    expect(retry.status).toBe(200);
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();

    store.clear();
    limitResults.length = 0;
    forResults.length = 0;
    seedClaim();
    limitResults.push([]);
    forceUnique.value = false;

    const noUnique = await POST(request());

    expect(noUnique.status).toBe(200);
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });
});
