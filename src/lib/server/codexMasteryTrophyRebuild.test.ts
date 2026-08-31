import { describe, expect, it } from "vitest";
import { createCodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import { emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import type { CodexMasteryProgress } from "@/adventure/data/v2/codexMasteryTypes";
import {
  mergeCodexMasteryTrophyUserIds,
  rebuildCodexMasteryTrophiesWithRuntime,
} from "./codexMasteryTrophyRebuild";

const NOW = new Date("2026-08-20T10:00:00.000Z");
const CATALOG = createCodexMasteryCatalog([{
  category: "fish",
  entryId: "carp",
  label: "잉어",
  thresholds: {
    bronze: 1,
    silver: 2,
    gold: 3,
    platinum: 4,
    diamond: 5,
    legendary: 6,
  },
  scoreWeightMilli: 1_000,
  seals: {},
}]);

function bronze(): CodexMasteryProgress {
  return {
    ...emptyCodexMasteryProgress("fish", "carp"),
    count: 1,
    currentTier: "bronze",
    tierAchievedAt: {
      discovered: "2026-01-01T00:00:00.000Z",
      bronze: "2026-01-02T00:00:00.000Z",
    },
    scoreMilli: 2_000,
  };
}

describe("codex mastery trophy rebuild", () => {
  it("merges progress-only and history-only users into a stable cursor page", () => {
    expect(mergeCodexMasteryTrophyUserIds(
      ["user-d", "user-a", "user-c"],
      ["user-b", "user-c", "user-e"],
      4,
    )).toEqual(["user-a", "user-b", "user-c", "user-d"]);
  });

  it("previews promotions without opening a write transaction", async () => {
    let transactionCalls = 0;
    let applyCalls = 0;
    const result = await rebuildCodexMasteryTrophiesWithRuntime({
      readProgress: async () => [bronze()],
      readHistory: async () => [],
      async transaction() {
        transactionCalls += 1;
        throw new Error("dry-run must not write");
      },
      async reconcile() {
        applyCalls += 1;
        return { changedFamilies: 1, promotions: [] };
      },
    }, {}, "u1", CATALOG, { apply: false, now: NOW, catalogVersion: 1 });

    expect(result).toEqual({
      applied: false,
      changedFamilies: 1,
      promotions: 1,
    });
    expect(transactionCalls).toBe(0);
    expect(applyCalls).toBe(0);
  });

  it("applies inside one transaction and is idempotent when nothing changes", async () => {
    const executors: unknown[] = [];
    const result = await rebuildCodexMasteryTrophiesWithRuntime({
      readProgress: async () => [],
      readHistory: async () => [],
      transaction: async (run) => run({ transaction: true }),
      reconcile: async (executor) => {
        executors.push(executor);
        return { changedFamilies: 0, promotions: [] };
      },
    }, {}, "u1", CATALOG, { apply: true, now: NOW, catalogVersion: 1 });

    expect(result).toEqual({ applied: true, changedFamilies: 0, promotions: 0 });
    expect(executors).toEqual([{ transaction: true }]);
  });
});
