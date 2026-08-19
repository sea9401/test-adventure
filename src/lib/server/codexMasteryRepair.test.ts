import { describe, expect, it } from "vitest";
import type {
  CodexMasteryCategory,
  CodexMasteryProgress,
  CodexMasteryTier,
} from "@/adventure/data/v2/codexMasteryTypes";
import {
  emptyCodexMasterySummary,
  type CodexMasterySummaryState,
} from "./codexMasteryRepository";
import {
  aggregateCodexMasterySummary,
  compareCodexMasterySummary,
  repairCodexMasterySummary,
  type CodexMasteryRepairProgressRow,
  type CodexMasteryRepairStore,
} from "./codexMasteryRepair";

function progressRow(options: {
  category?: CodexMasteryCategory;
  currentTier?: CodexMasteryTier;
  scoreMilli?: number;
  sealIds?: string[];
  updatedAt?: Date | null;
} = {}): CodexMasteryRepairProgressRow {
  const progress: CodexMasteryProgress = {
    category: options.category ?? "equipment",
    entryId: `${options.category ?? "equipment"}:entry`,
    count: 0,
    bestValue: null,
    currentTier: options.currentTier ?? "none",
    sealIds: options.sealIds ?? [],
    tierAchievedAt: {},
    scoreMilli: options.scoreMilli ?? 0,
  };
  return { ...progress, updatedAt: options.updatedAt ?? null };
}

type MemoryRepairStore = CodexMasteryRepairStore & {
  saveCalls: number;
  summary: CodexMasterySummaryState;
};

function repairStore(
  summary: Omit<Partial<CodexMasterySummaryState>, "categoryScoreMilli" | "stageCounts"> & {
    categoryScoreMilli?: Partial<CodexMasterySummaryState["categoryScoreMilli"]>;
    stageCounts?: Partial<CodexMasterySummaryState["stageCounts"]>;
  },
  progress: CodexMasteryRepairProgressRow[],
): MemoryRepairStore {
  const initial = emptyCodexMasterySummary();
  const store: MemoryRepairStore = {
    saveCalls: 0,
    summary: {
      ...initial,
      ...summary,
      categoryScoreMilli: {
        ...initial.categoryScoreMilli,
        ...summary.categoryScoreMilli,
      },
      stageCounts: { ...initial.stageCounts, ...summary.stageCounts },
    },
    async readSummary() {
      return store.summary;
    },
    async readProgress() {
      return progress;
    },
    async saveSummary(_, next) {
      store.saveCalls += 1;
      store.summary = next;
    },
  };
  return store;
}

describe("codex mastery summary repair", () => {
  it("rebuilds category scores and cumulative stage counts from progress rows", () => {
    // Break caught: summing only exact tiers, or omitting a stored score category.
    const rebuilt = aggregateCodexMasterySummary([
      progressRow({ category: "fish", currentTier: "gold", scoreMilli: 9_000, sealIds: ["giant"] }),
      progressRow({ category: "job", currentTier: "silver", scoreMilli: 4_000, sealIds: [] }),
    ]);

    expect(rebuilt).toMatchObject({
      totalScoreMilli: 13_000,
      categoryScoreMilli: { fish: 9_000, job: 4_000 },
      stageCounts: {
        bronze: 2,
        silver: 2,
        gold: 1,
        platinum: 0,
        diamond: 0,
        legendary: 0,
      },
      sealCount: 1,
    });
  });

  it("deduplicates seals within each progress row and falls back to the latest update time", () => {
    // Break caught: inflated seals from corrupted duplicate row values or unstable reach-time fallback.
    const latest = new Date("2026-08-20T01:00:00.000Z");
    const rebuilt = aggregateCodexMasterySummary([
      progressRow({
        category: "fish",
        currentTier: "bronze",
        scoreMilli: 1_000,
        sealIds: ["giant", "giant", "ancient"],
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
      progressRow({
        category: "monster",
        scoreMilli: 2_000,
        updatedAt: latest,
      }),
    ]);

    expect(rebuilt.sealCount).toBe(2);
    expect(rebuilt.scoreReachedAt).toEqual(latest);
  });

  it("reports field-level summary differences", () => {
    // Break caught: hiding a stale nested counter or treating equal date values as different.
    const before = emptyCodexMasterySummary();
    before.scoreReachedAt = new Date("2026-08-20T00:00:00.000Z");
    const after = {
      ...emptyCodexMasterySummary(),
      totalScoreMilli: 1_000,
      categoryScoreMilli: { ...emptyCodexMasterySummary().categoryScoreMilli, fish: 1_000 },
      stageCounts: { ...emptyCodexMasterySummary().stageCounts, bronze: 1 },
      scoreReachedAt: new Date("2026-08-20T00:00:00.000Z"),
    };

    expect(compareCodexMasterySummary(before, after)).toEqual({
      totalScoreMilli: { before: 0, after: 1_000 },
      "categoryScoreMilli.fish": { before: 0, after: 1_000 },
      "stageCounts.bronze": { before: 0, after: 1 },
    });
  });

  it("reports differences in dry-run mode without writing", async () => {
    // Break caught: a dry run mutating the persisted summary.
    const store = repairStore({ totalScoreMilli: 1 }, [
      progressRow({ category: "fish", currentTier: "gold", scoreMilli: 9_000 }),
    ]);

    const result = await repairCodexMasterySummary(store, "user-1", {
      apply: false,
      now: new Date("2026-08-20T00:00:00.000Z"),
    });

    expect(result.changed).toBe(true);
    expect(result.applied).toBe(false);
    expect(store.saveCalls).toBe(0);
  });

  it("retains an existing exact reach time when the rebuilt score is unchanged", async () => {
    // Break caught: replacing a known exact ranking tiebreaker with a coarse row-update fallback.
    const exact = new Date("2026-08-19T18:00:00.000Z");
    const store = repairStore({
      totalScoreMilli: 9_000,
      categoryScoreMilli: { fish: 9_000 },
      stageCounts: { bronze: 1, silver: 1, gold: 1 },
      scoreReachedAt: exact,
    }, [
      progressRow({
        category: "fish",
        currentTier: "gold",
        scoreMilli: 9_000,
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
    ]);

    const result = await repairCodexMasterySummary(store, "user-1", {
      apply: true,
      now: new Date("2026-08-20T01:00:00.000Z"),
    });

    expect(result.changed).toBe(false);
    expect(result.after.scoreReachedAt).toEqual(exact);
    expect(store.saveCalls).toBe(0);
  });

  it("applies only changed summaries when apply mode is selected", async () => {
    // Break caught: apply mode skipping stale summaries or writing already-repaired summaries.
    const changedStore = repairStore({}, [
      progressRow({ category: "life", currentTier: "bronze", scoreMilli: 1_000 }),
    ]);
    const unchangedStore = repairStore({}, []);
    const now = new Date("2026-08-20T00:00:00.000Z");

    await expect(repairCodexMasterySummary(changedStore, "user-1", { apply: true, now }))
      .resolves.toMatchObject({ changed: true, applied: true });
    await expect(repairCodexMasterySummary(unchangedStore, "user-2", { apply: true, now }))
      .resolves.toMatchObject({ changed: false, applied: false });

    expect(changedStore.saveCalls).toBe(1);
    expect(unchangedStore.saveCalls).toBe(0);
  });
});
