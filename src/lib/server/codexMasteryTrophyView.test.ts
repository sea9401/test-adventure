import { describe, expect, it } from "vitest";
import { createCodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import { emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import { buildCodexMasteryTrophyOptions } from "./codexMasteryTrophyView";

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

describe("codex mastery trophy view", () => {
  it("returns seven stable family cards with locked next-step progress", () => {
    const options = buildCodexMasteryTrophyOptions({
      catalog: CATALOG,
      progressRows: [],
      history: [],
      now: new Date("2026-08-20T11:00:00.000Z"),
      catalogVersion: 1,
    });

    expect(options).toHaveLength(7);
    expect(options.find((option) => option.id === "mastery:fish")).toMatchObject({
      kind: "mastery",
      category: "fish",
      title: "만경의 어탁",
      badgeTier: "bronze",
      unlocked: false,
      currentTier: null,
      nextTier: "bronze",
      progress: { current: 0, required: 1 },
      tierAchievedAt: {},
    });
    expect(options.find((option) => option.id === "mastery:overall")).toMatchObject({
      category: "overall",
      progress: { current: 0, required: 6 },
    });
  });

  it("shows the stored highest tier and complete promotion history", () => {
    const progress = {
      ...emptyCodexMasteryProgress("fish", "carp"),
      count: 4,
      currentTier: "platinum" as const,
      tierAchievedAt: {
        discovered: "2026-01-01T00:00:00.000Z",
        bronze: "2026-01-02T00:00:00.000Z",
        silver: "2026-01-03T00:00:00.000Z",
        gold: "2026-01-04T00:00:00.000Z",
        platinum: "2026-01-05T00:00:00.000Z",
      },
      scoreMilli: 11_000,
    };
    const options = buildCodexMasteryTrophyOptions({
      catalog: CATALOG,
      progressRows: [progress],
      history: [{
        trophyId: "mastery:fish",
        kind: "mastery_category",
        currentTier: "platinum",
        tierAchievedAt: {
          bronze: "2026-01-02T00:00:00.000Z",
          silver: "2026-01-03T00:00:00.000Z",
          gold: "2026-01-04T00:00:00.000Z",
          platinum: "2026-01-05T00:00:00.000Z",
        },
        catalogVersion: 1,
      }],
      now: new Date("2026-08-20T11:00:00.000Z"),
      catalogVersion: 1,
    });

    expect(options.find((option) => option.id === "mastery:fish")).toMatchObject({
      badgeTier: "platinum",
      unlocked: true,
      currentTier: "platinum",
      nextTier: "diamond",
      progress: { current: 0, required: 1 },
      tierAchievedAt: {
        bronze: "2026-01-02T00:00:00.000Z",
        silver: "2026-01-03T00:00:00.000Z",
        gold: "2026-01-04T00:00:00.000Z",
        platinum: "2026-01-05T00:00:00.000Z",
      },
    });
  });
});
