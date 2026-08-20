import { describe, expect, it } from "vitest";
import { createCodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import { emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import {
  buildCodexMasteryTrophyOptions,
  buildCodexResearchTrophyOptions,
  profileCodexTrophyDisplays,
} from "./codexMasteryTrophyView";

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
  it("maps selected permanent and monthly trophies into public profile displays", () => {
    const monthly = buildCodexResearchTrophyOptions([{
      trophyId: "research:2026-08",
      kind: "research_season",
      currentTier: "legendary",
      tierAchievedAt: { legendary: "2026-08-31T15:00:01.000Z" },
      catalogVersion: 1,
      seasonMetadata: {
        seasonId: "2026-08",
        themeId: "rivers-and-lakes",
        themeName: "강과 호수의 달",
        finalRank: 1,
        score: 19_000,
        objectiveCompletedCount: 18,
        objectiveScore: 12_000,
        diversityScore: 4_000,
        recordScore: 3_000,
        representativeRecord: null,
        settledAt: "2026-08-31T15:00:01.000Z",
        firstPlaceEngraving: true,
      },
    }]);
    const displays = profileCodexTrophyDisplays([], [{
      trophyId: monthly[0].id as `research:${string}`,
      kind: "research_season",
      currentTier: monthly[0].currentTier,
      tierAchievedAt: monthly[0].tierAchievedAt,
      catalogVersion: 1,
      seasonMetadata: monthly[0].season,
    }], new Set(["research:2026-08"]));

    expect(displays).toEqual([{
      trophyId: "research:2026-08",
      title: "강과 호수의 달",
      currentTier: "legendary",
      kind: "research",
    }]);
  });

  it("maps an awarded monthly season into a distinct display option", () => {
    const options = buildCodexResearchTrophyOptions([{
      trophyId: "research:2026-08",
      kind: "research_season",
      currentTier: "legendary",
      tierAchievedAt: { legendary: "2026-08-31T15:00:01.000Z" },
      catalogVersion: 1,
      seasonMetadata: {
        seasonId: "2026-08",
        themeId: "rivers-and-lakes",
        themeName: "강과 호수의 달",
        finalRank: 1,
        score: 19_000,
        objectiveCompletedCount: 18,
        objectiveScore: 12_000,
        diversityScore: 4_000,
        recordScore: 3_000,
        representativeRecord: null,
        settledAt: "2026-08-31T15:00:01.000Z",
        firstPlaceEngraving: true,
      },
    }]);

    expect(options).toEqual([expect.objectContaining({
      id: "research:2026-08",
      kind: "research",
      category: "research",
      title: "강과 호수의 달",
      badgeTier: "legendary",
      unlocked: true,
      currentTier: "legendary",
      nextTier: null,
      progress: null,
      season: expect.objectContaining({
        seasonId: "2026-08",
        finalRank: 1,
        score: 19_000,
      }),
    })]);
  });

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
