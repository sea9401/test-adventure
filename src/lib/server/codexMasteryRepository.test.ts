import { describe, expect, it } from "vitest";
import { codexMasterySummary } from "@/db/schema";
import type { DbExecutor } from "./savesKv";
import {
  codexMasteryRowToProgress,
  lockCodexMasteryState,
} from "./codexMasteryRepository";

type RecordedExecutor = {
  executor: DbExecutor;
  events: string[];
};

function recordingExecutor(): RecordedExecutor {
  const events: string[] = [];
  const summaryRow = {
    userId: "user-1",
    totalScoreMilli: 0,
    equipmentScoreMilli: 0,
    fishScoreMilli: 0,
    monsterScoreMilli: 0,
    cookingScoreMilli: 0,
    lifeScoreMilli: 0,
    jobScoreMilli: 0,
    bronzeCount: 0,
    silverCount: 0,
    goldCount: 0,
    platinumCount: 0,
    diamondCount: 0,
    legendaryCount: 0,
    sealCount: 0,
    scoreReachedAt: null,
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
  };
  const progressRow = {
    userId: "user-1",
    category: "fish",
    entryId: "fish:a",
    count: 0,
    bestValue: null,
    currentTier: "none",
    sealIds: [],
    tierAchievedAt: {},
    scoreMilli: 0,
    firstRecordedAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
  };

  const executor = {
    insert(table: unknown) {
      return {
        values() {
          return {
            async onConflictDoNothing() {
              events.push(table === codexMasterySummary ? "ensure-summary" : "ensure-progress");
            },
          };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                for(lockMode: string) {
                  return {
                    async limit() {
                      expect(lockMode).toBe("update");
                      events.push(table === codexMasterySummary
                        ? "lock-summary"
                        : "lock-progress");
                      return [table === codexMasterySummary ? summaryRow : progressRow];
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as DbExecutor;

  return { executor, events };
}

describe("codex mastery repository", () => {
  it("normalizes corrupted persisted progress fields without changing its identity", () => {
    // Break caught: accepting corrupt counters, IDs, tiers, seals, or achievement timestamps.
    expect(codexMasteryRowToProgress({
      category: "fish",
      entryId: "fish:a",
      count: -4,
      bestValue: Number.NaN,
      currentTier: "bogus",
      sealIds: ["giant", "giant", 4],
      tierAchievedAt: { bronze: "bad", gold: "2026-08-20T00:00:00.000Z" },
      scoreMilli: -10,
    })).toEqual({
      category: "fish",
      entryId: "fish:a",
      count: 0,
      bestValue: null,
      currentTier: "none",
      sealIds: ["giant"],
      tierAchievedAt: {},
      scoreMilli: 0,
    });
  });

  it("keeps only achieved ISO stages at or below the persisted tier", () => {
    // Break caught: returning a future, invalid, or malformed achievement timestamp.
    expect(codexMasteryRowToProgress({
      category: "fish",
      entryId: "fish:a",
      count: 4,
      bestValue: 9.5,
      currentTier: "silver",
      sealIds: [],
      tierAchievedAt: {
        discovered: "2026-08-18T00:00:00.000Z",
        bronze: "2026-08-19T00:00:00.000Z",
        silver: "2026-08-20T00:00:00.000Z",
        gold: "2026-08-21T00:00:00.000Z",
      },
      scoreMilli: 5_000,
    })).toMatchObject({
      currentTier: "silver",
      tierAchievedAt: {
        discovered: "2026-08-18T00:00:00.000Z",
        bronze: "2026-08-19T00:00:00.000Z",
        silver: "2026-08-20T00:00:00.000Z",
      },
    });
  });

  it("ensures and locks the user summary before the entry row", async () => {
    // Break caught: entry locks acquired before the per-user summary lock can deadlock cross-entry writes.
    const fake = recordingExecutor();

    await expect(lockCodexMasteryState(
      fake.executor,
      "user-1",
      "fish",
      "fish:a",
      new Date("2026-08-20T00:00:00.000Z"),
    )).resolves.toEqual({
      summary: expect.objectContaining({ totalScoreMilli: 0 }),
      progress: expect.objectContaining({ category: "fish", entryId: "fish:a" }),
    });
    expect(fake.events).toEqual([
      "ensure-summary",
      "lock-summary",
      "ensure-progress",
      "lock-progress",
    ]);
  });
});
