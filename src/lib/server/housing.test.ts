import { describe, expect, it } from "vitest";
import type { CodexMasteryTrophyHistory } from "@/adventure/data/v2/codexMasteryTrophies";
import type { CodexResearchSeasonTrophyHistory } from "@/adventure/data/v2/codexResearchRanking";
import type {
  HousingDisplayOption,
  HousingState,
} from "@/adventure/data/v2/housing";
import {
  housingMasteryTrophyContext,
  publicHousingOptions,
  sanitizePublicHousingState,
} from "./housing";

const HISTORY: CodexMasteryTrophyHistory[] = [
  {
    trophyId: "mastery:fish",
    kind: "mastery_category",
    currentTier: "platinum",
    tierAchievedAt: {
      bronze: "2026-01-01T00:00:00.000Z",
      silver: "2026-02-01T00:00:00.000Z",
      gold: "2026-03-01T00:00:00.000Z",
      platinum: "2026-04-01T00:00:00.000Z",
    },
    catalogVersion: 1,
  },
  {
    trophyId: "mastery:overall",
    kind: "mastery_overall",
    currentTier: "gold",
    tierAchievedAt: {
      bronze: "2026-01-05T00:00:00.000Z",
      silver: "2026-02-05T00:00:00.000Z",
      gold: "2026-03-05T00:00:00.000Z",
    },
    catalogVersion: 1,
  },
];

const RESEARCH_HISTORY: CodexResearchSeasonTrophyHistory[] = [{
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
}];

const FISH_OPTION: HousingDisplayOption = {
  kind: "fish",
  fishId: "crucian_carp",
  label: "붕어",
  detail: "일반 · 개인 최대 34.5cm",
};

function aquariumRoom(): HousingState {
  return {
    version: 1,
    isPublic: true,
    layout: [
      {
        uid: "aquarium",
        furnitureId: "trophy_aquarium",
        x: 0,
        y: 0,
        rotated: false,
        display: { kind: "fish", fishId: "crucian_carp" },
        masteryTrophy: { trophyId: "mastery:fish" },
      },
    ],
  };
}

describe("housing mastery trophy context", () => {
  it("turns earned history into authoritative tier-labelled display options", () => {
    const context = housingMasteryTrophyContext(HISTORY, RESEARCH_HISTORY);

    expect(context.entitlements.masteryTrophyIds).toEqual(
      new Set(["mastery:fish", "mastery:overall", "research:2026-08"]),
    );
    expect(context.displayOptions).toEqual([
      {
        kind: "masteryTrophy",
        trophyId: "mastery:fish",
        category: "fish",
        currentTier: "platinum",
        label: "만경의 어탁",
        detail: "도감 숙련 · 백금",
      },
      {
        kind: "masteryTrophy",
        trophyId: "mastery:overall",
        category: "overall",
        currentTier: "gold",
        label: "모험왕의 대서",
        detail: "도감 숙련 · 금",
      },
      {
        kind: "masteryTrophy",
        trophyId: "research:2026-08",
        category: "research",
        currentTier: "legendary",
        label: "강과 호수의 달",
        detail: "2026-08 · 최종 1위 · 전설",
      },
    ]);
  });

  it("publishes an artifact and its selected trophy companion together", () => {
    const context = housingMasteryTrophyContext(HISTORY);

    expect(publicHousingOptions(
      aquariumRoom(),
      [FISH_OPTION, ...context.displayOptions],
    )).toEqual([
      FISH_OPTION,
      expect.objectContaining({
        kind: "masteryTrophy",
        trophyId: "mastery:fish",
      }),
    ]);
  });

  it("removes only a stale trophy companion while retaining a valid artifact", () => {
    const sanitized = sanitizePublicHousingState(
      aquariumRoom(),
      [FISH_OPTION],
    );

    expect(sanitized.layout[0]).toMatchObject({
      display: { kind: "fish", fishId: "crucian_carp" },
    });
    expect(sanitized.layout[0]).not.toHaveProperty("masteryTrophy");
  });
});
