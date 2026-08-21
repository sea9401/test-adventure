import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
import { FISHING_SESSION_KEY } from "@/adventure/v2/fishingSession";
import { MINING_SESSION_KEY } from "@/adventure/v2/miningSession";
import { WOODCUTTING_SESSION_KEY } from "@/adventure/v2/woodcuttingSession";

const mocks = vi.hoisted(() => ({
  lockSaves: vi.fn(),
  readSaves: vi.fn(),
  lockSingle: vi.fn(async () => {
    throw new Error("single save lock used");
  }),
  readSingle: vi.fn(async () => {
    throw new Error("single save read used");
  }),
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSavesForUpdate: mocks.lockSaves,
  readSaves: mocks.readSaves,
  lockSaveForUpdate: mocks.lockSingle,
  readSave: mocks.readSingle,
}));

import {
  activeAutoGatheringActivity,
  lockActiveManualLifeActivity,
  lockAutoGatheringStatesForUpdate,
  readActiveAutoGatheringActivity,
} from "./lifeActivityLock";

function transactionExecutor() {
  const query: Record<string, unknown> = {};
  query.from = () => query;
  query.where = () => query;
  query.for = () => query;
  query.limit = async () => [{ id: "user-1" }];
  return { select: () => query } as never;
}

describe("life activity save batching", () => {
  beforeEach(() => vi.clearAllMocks());

  it("locks both auto-gathering states with one save query", async () => {
    mocks.lockSaves.mockResolvedValue({
      [WOODCUTTING_AUTO_KEY]: {
        session: {
          sessionId: "wood",
          sourceId: "oak",
          sourceName: "참나무",
          materialId: "oak_log",
          startedAt: 10,
          readyAt: 20,
          cycleDurationMs: 1_000,
          attempts: 1,
          successRate: 1,
          bonusMaterialRate: 0,
          baseXp: 1,
        },
      },
      [MINING_AUTO_KEY]: {},
    });

    const states = await lockAutoGatheringStatesForUpdate(
      transactionExecutor(),
      "user-1",
    );

    expect(activeAutoGatheringActivity(states)).toBe("woodcutting");
    expect(mocks.lockSaves).toHaveBeenCalledTimes(1);
  });

  it("reads both auto-gathering states with one save query", async () => {
    mocks.readSaves.mockResolvedValue({
      [WOODCUTTING_AUTO_KEY]: {},
      [MINING_AUTO_KEY]: {
        session: {
          sessionId: "mine",
          sourceId: "iron",
          sourceName: "철 광맥",
          materialId: "iron_ore",
          startedAt: 10,
          readyAt: 20,
          cycleDurationMs: 1_000,
          attempts: 1,
          successRate: 1,
          bonusMaterialRate: 0,
          baseXp: 1,
        },
      },
    });

    await expect(readActiveAutoGatheringActivity({} as never, "user-1"))
      .resolves.toBe("mining");
    expect(mocks.readSaves).toHaveBeenCalledTimes(1);
  });

  it("locks all manual life sessions with one save query", async () => {
    mocks.lockSaves.mockResolvedValue({
      [FISHING_SESSION_KEY]: {
        castId: "cast",
        biteAt: 10,
        expiresAt: 100,
        fishId: "carp",
        size: 10,
      },
      [WOODCUTTING_SESSION_KEY]: {},
      [MINING_SESSION_KEY]: {},
    });

    await expect(lockActiveManualLifeActivity({} as never, "user-1", 50))
      .resolves.toBe("fishing");
    expect(mocks.lockSaves).toHaveBeenCalledTimes(1);
  });
});
