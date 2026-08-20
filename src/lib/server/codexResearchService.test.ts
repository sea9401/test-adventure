import { describe, expect, it, vi } from "vitest";
import type {
  CodexResearchDefinitionSnapshot,
  CodexResearchEvent,
  CodexResearchObjective,
  CodexResearchProgress,
} from "@/adventure/data/v2/codexResearch";
import {
  emptyCodexResearchProgress,
  kstCodexResearchSeasonWindow,
} from "@/adventure/data/v2/codexResearch";
import type { CodexResearchSeasonState } from "./codexResearchRepository";
import {
  createCodexResearchPersonalReader,
  createCodexResearchRecorder,
} from "./codexResearchService";

const NOW = new Date("2026-08-20T03:04:05.000Z");

function definition(): CodexResearchDefinitionSnapshot {
  const groups: Array<[
    CodexResearchObjective["group"],
    number,
    number,
  ]> = [
    ["basic", 6, 400],
    ["field", 6, 600],
    ["expert", 4, 1_000],
    ["challenge", 2, 1_000],
  ];
  return {
    version: 1,
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
        filter: {
          category: "fish" as const,
          entryIds: [`fish-${group}-${index + 1}`],
          sources: ["fishing.catch" as const],
        },
        rule: { kind: "count" as const, target: 3 },
      }))
    ),
    diversityTracks: [
      {
        id: "fish-variety",
        label: "어종",
        filter: { category: "fish", sources: ["fishing.catch"] },
        pointsPerEntry: 300,
        maxEntries: 10,
      },
      {
        id: "field-variety",
        label: "현장",
        filter: { category: "life", sources: ["life.complete"] },
        pointsPerEntry: 200,
        maxEntries: 10,
      },
    ],
    recordTracks: [
      {
        id: "record-a",
        label: "기록 A",
        filter: { category: "fish", sources: ["fishing.catch"] },
        milestones: [{ value: 10, score: 1_500 }],
      },
      {
        id: "record-b",
        label: "기록 B",
        filter: {
          category: "fish",
          entryIds: ["rare-fish"],
          sources: ["fishing.catch"],
        },
        milestones: [{ value: 10, score: 1_500 }],
      },
    ],
  };
}

function season(overrides: Partial<CodexResearchSeasonState> = {}): CodexResearchSeasonState {
  const snapshot = definition();
  const window = kstCodexResearchSeasonWindow(snapshot.seasonId);
  return {
    seasonId: snapshot.seasonId,
    themeId: snapshot.themeId,
    definition: snapshot,
    startAt: window.startAt,
    endAt: window.endAt,
    status: "scheduled",
    settledAt: null,
    ...overrides,
  };
}

function fishEvent(
  entryId = "fish-basic-1",
  overrides: Partial<CodexResearchEvent> = {},
): CodexResearchEvent {
  return {
    category: "fish",
    entryId,
    amount: 1,
    bestValue: 12,
    source: "fishing.catch",
    ...overrides,
  };
}

function runtime(options: {
  season?: CodexResearchSeasonState | null;
  progress?: CodexResearchProgress | null;
  saveFailure?: Error;
} = {}) {
  let stored = options.progress === undefined
    ? emptyCodexResearchProgress()
    : options.progress;
  const value = {
    readCurrent: vi.fn(async () => options.season === undefined ? season() : options.season),
    readProgress: vi.fn(async () => stored),
    lockProgress: vi.fn(async () => stored ?? emptyCodexResearchProgress()),
    saveProgress: vi.fn(async (
      _executor: object,
      _userId: string,
      _seasonId: string,
      progress: CodexResearchProgress,
    ) => {
      if (options.saveFailure) throw options.saveFailure;
      stored = progress;
    }),
    activateSeason: vi.fn(async () => undefined),
  };
  return { value, get stored() { return stored; } };
}

describe("codex research recording service", () => {
  it("does nothing when the operator has not scheduled the current month", async () => {
    const fake = runtime({ season: null });
    const record = createCodexResearchRecorder(fake.value);

    await expect(record({}, "user-1", [fishEvent()], NOW)).resolves.toEqual({
      recorded: false,
      reason: "no_active_season",
    });
    expect(fake.value.readCurrent).toHaveBeenCalledTimes(1);
    expect(fake.value.lockProgress).not.toHaveBeenCalled();
    expect(fake.value.saveProgress).not.toHaveBeenCalled();
    expect(fake.value.activateSeason).not.toHaveBeenCalled();
  });

  it("locks and saves once for a multi-event batch then lazily activates", async () => {
    const fake = runtime();
    const record = createCodexResearchRecorder(fake.value);
    const events = [
      fishEvent("fish-basic-1", { amount: 1, bestValue: 12 }),
      fishEvent("fish-basic-1", { amount: 2, bestValue: 11 }),
      fishEvent("fish-field-2", { amount: 1, bestValue: 15 }),
    ];

    const result = await record({}, "user-1", events, NOW);

    expect(result).toMatchObject({
      recorded: true,
      seasonId: "2026-08",
      progress: {
        objectiveCompletedCount: 1,
        diversityScore: 600,
        recordScore: 1_500,
        score: 2_500,
      },
    });
    expect(fake.value.readCurrent).toHaveBeenCalledTimes(1);
    expect(fake.value.lockProgress).toHaveBeenCalledTimes(1);
    expect(fake.value.saveProgress).toHaveBeenCalledTimes(1);
    expect(fake.value.activateSeason).toHaveBeenCalledWith(
      expect.anything(),
      "2026-08",
      NOW,
    );
  });

  it("does not save or activate for a valid nonmatching event", async () => {
    const fake = runtime();
    const record = createCodexResearchRecorder(fake.value);

    await expect(record({}, "user-1", [{
      category: "monster",
      entryId: "bat",
      amount: 1,
      source: "hunt.victory",
    }], NOW)).resolves.toEqual({ recorded: false, reason: "unchanged" });
    expect(fake.value.lockProgress).toHaveBeenCalledTimes(1);
    expect(fake.value.saveProgress).not.toHaveBeenCalled();
    expect(fake.value.activateSeason).not.toHaveBeenCalled();
  });

  it("rejects a corrupted definition before locking user progress", async () => {
    const invalid = season();
    invalid.definition.objectives[0].points += 1;
    const fake = runtime({ season: invalid });
    const record = createCodexResearchRecorder(fake.value);

    await expect(record({}, "user-1", [fishEvent()], NOW))
      .rejects.toThrow("objective score budget");
    expect(fake.value.lockProgress).not.toHaveBeenCalled();
  });

  it("checks the exclusive end boundary even if a store returns a stale season", async () => {
    const ended = season();
    const fake = runtime({ season: ended });
    const record = createCodexResearchRecorder(fake.value);

    await expect(record({}, "user-1", [fishEvent()], ended.endAt))
      .resolves.toEqual({ recorded: false, reason: "no_active_season" });
    expect(fake.value.lockProgress).not.toHaveBeenCalled();
  });

  it("propagates persistence failures to the caller transaction", async () => {
    const fake = runtime({ saveFailure: new Error("database write failed") });
    const record = createCodexResearchRecorder(fake.value);

    await expect(record({}, "user-1", [fishEvent()], NOW))
      .rejects.toThrow("database write failed");
    expect(fake.value.activateSeason).not.toHaveBeenCalled();
  });
});

describe("codex research personal reader", () => {
  it("returns an explicit no-season view without reading progress", async () => {
    const fake = runtime({ season: null });
    const read = createCodexResearchPersonalReader(fake.value);

    await expect(read({}, "user-1", NOW)).resolves.toEqual({
      status: "no_season",
    });
    expect(fake.value.readProgress).not.toHaveBeenCalled();
  });

  it("builds all 18 zero-progress goals without creating a row", async () => {
    const fake = runtime({ progress: null });
    const read = createCodexResearchPersonalReader(fake.value);

    const view = await read({}, "user-1", NOW);

    expect(view).toMatchObject({
      status: "active",
      seasonId: "2026-08",
      themeName: "강과 호수의 달",
      score: 0,
      objectiveScore: 0,
      diversityScore: 0,
      recordScore: 0,
      objectiveCompletedCount: 0,
      objectiveCount: 18,
    });
    expect(view.status === "active" ? view.objectives : []).toHaveLength(18);
    expect(fake.value.readProgress).toHaveBeenCalledTimes(1);
    expect(fake.value.lockProgress).not.toHaveBeenCalled();
    expect(fake.value.saveProgress).not.toHaveBeenCalled();
  });

  it("returns authoritative progress and objective percentages", async () => {
    const recordingRuntime = runtime();
    const record = createCodexResearchRecorder(recordingRuntime.value);
    await record({}, "user-1", [fishEvent("fish-basic-1", { amount: 2 })], NOW);
    const read = createCodexResearchPersonalReader(recordingRuntime.value);

    const view = await read({}, "user-1", NOW);

    expect(view).toMatchObject({
      status: "active",
      score: 1_800,
      objectiveScore: 0,
      diversityScore: 300,
      recordScore: 1_500,
    });
    if (view.status !== "active") throw new Error("expected active view");
    expect(view.objectives[0]).toMatchObject({
      id: "basic-1",
      value: 2,
      target: 3,
      progressPercent: 67,
      completedAt: null,
    });
    expect(view.representativeRecord).toMatchObject({ entryId: "fish-basic-1" });
  });
});
