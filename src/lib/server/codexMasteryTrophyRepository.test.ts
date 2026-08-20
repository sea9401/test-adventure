import { describe, expect, it, vi } from "vitest";
import { createCodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import { emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import type {
  CodexMasteryEntryDefinition,
  CodexMasteryProgress,
} from "@/adventure/data/v2/codexMasteryTypes";
import type { CodexMasteryTrophyHistory } from "@/adventure/data/v2/codexMasteryTrophies";
import {
  codexTrophyHistoryRowToState,
  reconcileCodexMasteryTrophiesWithRuntime,
} from "./codexMasteryTrophyRepository";

const NOW = new Date("2026-08-20T09:30:00.000Z");
const DEFINITION: CodexMasteryEntryDefinition = {
  category: "equipment",
  entryId: "sword",
  label: "검",
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
};
const CATALOG = createCodexMasteryCatalog([DEFINITION]);

function goldProgress(): CodexMasteryProgress {
  return {
    ...emptyCodexMasteryProgress("equipment", "sword"),
    count: 3,
    currentTier: "gold",
    tierAchievedAt: {
      discovered: "2026-01-01T00:00:00.000Z",
      bronze: "2026-01-02T00:00:00.000Z",
      silver: "2026-01-03T00:00:00.000Z",
      gold: "2026-01-04T00:00:00.000Z",
    },
    scoreMilli: 7_000,
  };
}

describe("codex mastery trophy repository", () => {
  it("rejects malformed persisted trophy rows instead of hiding corruption", () => {
    expect(() => codexTrophyHistoryRowToState({
      trophyId: "mastery:equipment",
      trophyKind: "mastery_category",
      currentTier: "mythic",
      tierAchievedAt: {},
      catalogVersion: 1,
    })).toThrow("malformed");
    expect(() => codexTrophyHistoryRowToState({
      trophyId: "mastery:equipment",
      trophyKind: "mastery_overall",
      currentTier: "gold",
      tierAchievedAt: { gold: "not-a-date" },
      catalogVersion: 1,
    })).toThrow("malformed");
  });

  it("maps a complete persisted row without changing its achievement history", () => {
    expect(codexTrophyHistoryRowToState({
      trophyId: "mastery:equipment",
      trophyKind: "mastery_category",
      currentTier: "gold",
      tierAchievedAt: {
        bronze: "2026-01-02T00:00:00.000Z",
        silver: "2026-01-03T00:00:00.000Z",
        gold: "2026-01-04T00:00:00.000Z",
      },
      catalogVersion: 1,
    })).toEqual({
      trophyId: "mastery:equipment",
      kind: "mastery_category",
      currentTier: "gold",
      tierAchievedAt: {
        bronze: "2026-01-02T00:00:00.000Z",
        silver: "2026-01-03T00:00:00.000Z",
        gold: "2026-01-04T00:00:00.000Z",
      },
      catalogVersion: 1,
    });
  });

  it("writes newly earned families once and becomes idempotent on rerun", async () => {
    const stored: CodexMasteryTrophyHistory[] = [];
    const writeHistory = vi.fn(async (
      _executor: object,
      _userId: string,
      next: readonly CodexMasteryTrophyHistory[],
    ) => {
      stored.splice(0, stored.length, ...next.map((item) => ({
        ...item,
        tierAchievedAt: { ...item.tierAchievedAt },
      })));
    });
    const runtime = {
      lockUser: vi.fn(async () => undefined),
      readProgress: vi.fn(async () => [goldProgress()]),
      readHistory: vi.fn(async () => stored),
      writeHistory,
    };

    const first = await reconcileCodexMasteryTrophiesWithRuntime(
      runtime,
      {},
      "u1",
      CATALOG,
      NOW,
      4,
    );
    const second = await reconcileCodexMasteryTrophiesWithRuntime(
      runtime,
      {},
      "u1",
      CATALOG,
      NOW,
      4,
    );

    expect(first.changedFamilies).toBe(1);
    expect(first.promotions.map(({ trophyId, tier }) => [trophyId, tier])).toEqual([
      ["mastery:equipment", "bronze"],
      ["mastery:equipment", "silver"],
      ["mastery:equipment", "gold"],
    ]);
    expect(second).toMatchObject({ changedFamilies: 0, promotions: [] });
    expect(writeHistory).toHaveBeenCalledTimes(1);
  });

  it("keeps a stored higher tier and only refreshes an older catalog version", async () => {
    const history: CodexMasteryTrophyHistory[] = [{
      trophyId: "mastery:equipment",
      kind: "mastery_category",
      currentTier: "diamond",
      tierAchievedAt: {
        bronze: "2025-01-01T00:00:00.000Z",
        silver: "2025-02-01T00:00:00.000Z",
        gold: "2025-03-01T00:00:00.000Z",
        platinum: "2025-04-01T00:00:00.000Z",
        diamond: "2025-05-01T00:00:00.000Z",
      },
      catalogVersion: 1,
    }];
    const writes: CodexMasteryTrophyHistory[][] = [];
    const result = await reconcileCodexMasteryTrophiesWithRuntime(
      {
        lockUser: async () => undefined,
        readProgress: async () => [goldProgress()],
        readHistory: async () => history,
        writeHistory: async (_executor, _userId, next) => {
          writes.push([...next]);
        },
      },
      {},
      "u1",
      CATALOG,
      NOW,
      2,
    );

    expect(result.promotions).toEqual([]);
    expect(result.changedFamilies).toBe(1);
    expect(writes[0][0]).toMatchObject({
      trophyId: "mastery:equipment",
      currentTier: "diamond",
      catalogVersion: 2,
    });
    expect(writes[0][0].tierAchievedAt.diamond).toBe("2025-05-01T00:00:00.000Z");
  });
});
