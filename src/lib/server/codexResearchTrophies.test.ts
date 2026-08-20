import { describe, expect, it, vi } from "vitest";
import type {
  CodexResearchDefinitionSnapshot,
  CodexResearchObjective,
} from "@/adventure/data/v2/codexResearch";
import { kstCodexResearchSeasonWindow } from "@/adventure/data/v2/codexResearch";
import type { CodexResearchSeasonState } from "./codexResearchRepository";
import {
  codexResearchTrophyHistoryRowToState,
  createCodexResearchTrophyAwarder,
  type CodexResearchFinalist,
  type CodexResearchTrophyAwardRuntime,
} from "./codexResearchTrophies";

const SETTLED_AT = new Date("2026-08-31T15:00:01.000Z");

function definition(): CodexResearchDefinitionSnapshot {
  const groups: Array<[CodexResearchObjective["group"], number, number]> = [
    ["basic", 6, 400],
    ["field", 6, 600],
    ["expert", 4, 1_000],
    ["challenge", 2, 1_000],
  ];
  return {
    version: 2,
    seasonId: "2026-08",
    themeId: "rivers-and-lakes",
    themeName: "강과 호수의 달",
    primaryCategories: ["fish", "life"],
    supportCategory: "cooking",
    objectives: groups.flatMap(([group, count, points]) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${group}-${index + 1}`,
        group,
        label: `${group} ${index + 1}`,
        description: "설명",
        points,
        filter: { category: "fish" as const, sources: ["fishing.catch" as const] },
        rule: { kind: "count" as const, target: 1 },
      }))
    ),
    diversityTracks: [{
      id: "fish",
      label: "어류",
      filter: { category: "fish", sources: ["fishing.catch"] },
      pointsPerEntry: 500,
      maxEntries: 10,
    }],
    recordTracks: [{
      id: "record",
      label: "기록",
      filter: { category: "fish", sources: ["fishing.catch"] },
      milestones: [{ value: 10, score: 3_000 }],
    }],
  };
}

function season(
  overrides: Partial<CodexResearchSeasonState> = {},
): CodexResearchSeasonState {
  const snapshot = definition();
  const window = kstCodexResearchSeasonWindow(snapshot.seasonId);
  return {
    seasonId: snapshot.seasonId,
    themeId: snapshot.themeId,
    definition: snapshot,
    startAt: window.startAt,
    endAt: window.endAt,
    status: "closed",
    settledAt: SETTLED_AT,
    ...overrides,
  };
}

function finalist(
  overrides: Partial<CodexResearchFinalist> = {},
): CodexResearchFinalist {
  return {
    userId: "winner",
    score: 19_000,
    objectiveCompletedCount: 18,
    diversityScore: 4_000,
    recordScore: 3_000,
    finalRank: 1,
    finalTier: "legendary",
    representativeRecord: {
      trackId: "record",
      category: "fish",
      entryId: "giant-carp",
      value: 99.9,
      recordedAt: "2026-08-20T00:00:00.000Z",
    },
    ...overrides,
  };
}

function runtimeFixture(options: {
  season?: CodexResearchSeasonState;
  finalists?: CodexResearchFinalist[];
  writeResult?: "created" | "existing";
} = {}) {
  const written: unknown[] = [];
  const runtime: CodexResearchTrophyAwardRuntime<object> = {
    lockSeason: vi.fn(async () => options.season ?? season()),
    readFinalists: vi.fn(async () => options.finalists ?? []),
    writeHistory: vi.fn(async (_executor, userId, history) => {
      written.push({ userId, history });
      return options.writeResult ?? "created";
    }),
  };
  return { runtime, written };
}

describe("monthly codex research trophies", () => {
  it("rejects publication before a season is closed", async () => {
    const fixture = runtimeFixture({
      season: season({ status: "active", settledAt: null }),
    });
    const award = createCodexResearchTrophyAwarder(fixture.runtime);

    await expect(award({}, "2026-08")).rejects.toThrow(
      "season is not closed",
    );
    expect(fixture.runtime.readFinalists).not.toHaveBeenCalled();
  });

  it("publishes immutable final metadata without adding lower-tier rows", async () => {
    const fixture = runtimeFixture({
      finalists: [
        finalist(),
        finalist({
          userId: "platinum",
          score: 16_000,
          objectiveCompletedCount: 14,
          diversityScore: 2_000,
          recordScore: 2_000,
          finalRank: 11,
          finalTier: "platinum",
          representativeRecord: null,
        }),
      ],
    });
    const award = createCodexResearchTrophyAwarder(fixture.runtime);

    await expect(award({}, "2026-08")).resolves.toEqual({
      status: "awarded",
      seasonId: "2026-08",
      eligibleCount: 2,
      createdCount: 2,
      existingCount: 0,
    });
    expect(fixture.written[0]).toMatchObject({
      userId: "winner",
      history: {
        trophyId: "research:2026-08",
        kind: "research_season",
        currentTier: "legendary",
        tierAchievedAt: { legendary: SETTLED_AT.toISOString() },
        catalogVersion: 2,
        seasonMetadata: {
          seasonId: "2026-08",
          themeId: "rivers-and-lakes",
          themeName: "강과 호수의 달",
          finalRank: 1,
          score: 19_000,
          objectiveScore: 12_000,
          firstPlaceEngraving: true,
        },
      },
    });
    expect(fixture.written[1]).toMatchObject({
      history: {
        currentTier: "platinum",
        tierAchievedAt: { platinum: SETTLED_AT.toISOString() },
        seasonMetadata: { finalRank: 11, firstPlaceEngraving: false },
      },
    });
  });

  it("reports idempotent stored trophies separately", async () => {
    const fixture = runtimeFixture({
      finalists: [finalist()],
      writeResult: "existing",
    });
    const award = createCodexResearchTrophyAwarder(fixture.runtime);

    await expect(award({}, "2026-08")).resolves.toMatchObject({
      createdCount: 0,
      existingCount: 1,
    });
  });

  it("rejects trophy rows whose tier, rank, ID, or engraving conflicts", () => {
    const valid = {
      trophyId: "research:2026-08",
      trophyKind: "research_season",
      currentTier: "legendary",
      tierAchievedAt: { legendary: SETTLED_AT.toISOString() },
      catalogVersion: 2,
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
        settledAt: SETTLED_AT.toISOString(),
        firstPlaceEngraving: true,
      },
    };

    expect(codexResearchTrophyHistoryRowToState(valid)).toMatchObject({
      trophyId: "research:2026-08",
      currentTier: "legendary",
    });
    for (const broken of [
      { ...valid, trophyId: "research:2026-07" },
      { ...valid, currentTier: "diamond" },
      {
        ...valid,
        seasonMetadata: { ...valid.seasonMetadata, firstPlaceEngraving: false },
      },
      {
        ...valid,
        seasonMetadata: { ...valid.seasonMetadata, settledAt: "2026-02-30T00:00:00.000Z" },
      },
    ]) {
      expect(() => codexResearchTrophyHistoryRowToState(broken)).toThrow(
        "research trophy history row is malformed",
      );
    }
  });
});
