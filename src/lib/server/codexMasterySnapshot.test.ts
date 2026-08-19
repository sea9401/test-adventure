import { describe, expect, it } from "vitest";
import { createCodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import type {
  CodexMasteryEntryDefinition,
  CodexMasteryProgress,
} from "@/adventure/data/v2/codexMasteryTypes";
import { emptyCodexMasterySummary } from "./codexMasteryRepository";
import { buildCodexMasterySnapshot } from "./codexMasterySnapshot";

const thresholds = {
  bronze: 1,
  silver: 3,
  gold: 10,
  platinum: 20,
  diamond: 50,
  legendary: 100,
} as const;

const definitions: CodexMasteryEntryDefinition[] = [
  {
    category: "fish",
    entryId: "carp",
    label: "황금 잉어",
    thresholds,
    scoreWeightMilli: 1_000,
    seals: { giant: { pointUnits: 2 } },
  },
  {
    category: "job",
    entryId: "warrior",
    label: "전사",
    thresholds: {
      bronze: 50,
      silver: 250,
      gold: 1_000,
      platinum: 2_500,
      diamond: 5_000,
      legendary: 10_000,
    },
    scoreWeightMilli: 2_000,
    seals: {},
  },
];

const catalog = createCodexMasteryCatalog(definitions);

function progress(
  overrides: Partial<CodexMasteryProgress>,
): CodexMasteryProgress {
  return {
    category: "fish",
    entryId: "carp",
    count: 4,
    bestValue: 88.4,
    currentTier: "silver",
    sealIds: ["giant"],
    tierAchievedAt: {
      discovered: "2026-08-01T00:00:00.000Z",
      bronze: "2026-08-02T00:00:00.000Z",
      silver: "2026-08-10T00:00:00.000Z",
    },
    scoreMilli: 4_500,
    ...overrides,
  };
}

const features = {
  rankingVisible: false,
  sealsEnabled: true,
  trophiesEnabled: false,
  monthlyProgressEnabled: false,
};

describe("codex mastery view snapshot", () => {
  it("joins sparse progress to the full catalog and keeps summary scores authoritative", () => {
    const summary = emptyCodexMasterySummary();
    summary.totalScoreMilli = 12_500;
    summary.categoryScoreMilli.fish = 2_500;
    summary.categoryScoreMilli.job = 10_499;
    summary.stageCounts = {
      bronze: 4,
      silver: 3,
      gold: 2,
      platinum: 1,
      diamond: 0,
      legendary: 0,
    };
    const snapshot = buildCodexMasterySnapshot({
      summary,
      progressRows: [
        progress({}),
        progress({ category: "fish", entryId: "removed-fish" }),
      ],
      pinnedGoals: [{ category: "job", entryId: "warrior" }],
      features,
      catalog,
    });

    expect(snapshot.summary).toMatchObject({
      totalScore: 13,
      discoveredCount: 1,
      totalEntries: 2,
      stageCounts: { bronze: 4, silver: 3, gold: 2, platinum: 1 },
    });
    expect(snapshot.categories.map((entry) => entry.category)).toEqual([
      "equipment", "fish", "monster", "cooking", "life", "job",
    ]);
    expect(snapshot.categories.find((entry) => entry.category === "fish"))
      .toMatchObject({ score: 3, discoveredCount: 1, totalEntries: 1 });
    expect(snapshot.categories.find((entry) => entry.category === "job"))
      .toMatchObject({ score: 10, discoveredCount: 0, totalEntries: 1 });
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0]).toMatchObject({
      key: "fish:carp",
      label: "황금 잉어",
      currentTier: "silver",
      nextStage: "gold",
      nextThreshold: 10,
      nextProgressPercent: 40,
      pinned: false,
    });
    expect(snapshot.entries[1]).toMatchObject({
      key: "job:warrior",
      currentTier: "none",
      count: 0,
      nextStage: "discovered",
      nextThreshold: null,
      pinned: true,
    });
  });

  it("sorts recent promotions newest first with a stable tie break", () => {
    const snapshot = buildCodexMasterySnapshot({
      summary: emptyCodexMasterySummary(),
      progressRows: [
        progress({}),
        progress({
          category: "job",
          entryId: "warrior",
          count: 49,
          currentTier: "discovered",
          tierAchievedAt: { discovered: "2026-08-10T00:00:00.000Z" },
          bestValue: null,
          sealIds: [],
        }),
      ],
      pinnedGoals: [],
      features,
      catalog,
    });

    expect(snapshot.recentPromotions.slice(0, 3).map((promotion) =>
      `${promotion.key}/${promotion.stage}`
    )).toEqual([
      "fish:carp/silver",
      "job:warrior/discovered",
      "fish:carp/bronze",
    ]);
  });

  it("ranks only started non-legendary entries as near goals", () => {
    const snapshot = buildCodexMasterySnapshot({
      summary: emptyCodexMasterySummary(),
      progressRows: [
        progress({}),
        progress({
          category: "job",
          entryId: "warrior",
          count: 49,
          currentTier: "discovered",
          tierAchievedAt: { discovered: "2026-08-10T00:00:00.000Z" },
          bestValue: null,
          sealIds: [],
        }),
        progress({
          category: "fish",
          entryId: "removed-fish",
          count: 99,
          currentTier: "diamond",
        }),
      ],
      pinnedGoals: [],
      features,
      catalog,
    });

    expect(snapshot.nearGoals.map((goal) => [goal.key, goal.nextProgressPercent]))
      .toEqual([
        ["job:warrior", 98],
        ["fish:carp", 40],
      ]);
  });
});
