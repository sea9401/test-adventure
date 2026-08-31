import { describe, expect, it } from "vitest";
import type {
  CodexResearchDefinitionSnapshot,
  CodexResearchEvent,
  CodexResearchObjective,
} from "./codexResearch";
import {
  applyCodexResearchEvents,
  CODEX_RESEARCH_GROUP_COUNTS,
  emptyCodexResearchProgress,
  isCodexResearchSeasonOpen,
  kstCodexResearchSeasonWindow,
  validateCodexResearchSeasonDefinition,
} from "./codexResearch";

const NOW = new Date("2026-08-20T03:04:05.000Z");

function objective(
  id: string,
  group: CodexResearchObjective["group"],
  points: number,
  overrides: Partial<CodexResearchObjective> = {},
): CodexResearchObjective {
  return {
    id,
    group,
    label: `연구 ${id}`,
    description: `${id} 설명`,
    points,
    filter: {
      category: "fish",
      entryIds: [`fish-${id}`],
      sources: ["fishing.catch"],
    },
    rule: { kind: "count", target: 3 },
    ...overrides,
  };
}

export function validCodexResearchDefinition(
  overrides: Partial<CodexResearchDefinitionSnapshot> = {},
): CodexResearchDefinitionSnapshot {
  const objectives: CodexResearchObjective[] = [
    ...Array.from({ length: CODEX_RESEARCH_GROUP_COUNTS.basic }, (_, index) =>
      objective(`basic-${index + 1}`, "basic", 400)),
    ...Array.from({ length: CODEX_RESEARCH_GROUP_COUNTS.field }, (_, index) =>
      objective(`field-${index + 1}`, "field", 600)),
    ...Array.from({ length: CODEX_RESEARCH_GROUP_COUNTS.expert }, (_, index) =>
      objective(`expert-${index + 1}`, "expert", 1_000)),
    ...Array.from({ length: CODEX_RESEARCH_GROUP_COUNTS.challenge }, (_, index) =>
      objective(`challenge-${index + 1}`, "challenge", 1_000)),
  ];
  objectives[6] = objective("field-1", "field", 600, {
    filter: { category: "fish", sources: ["fishing.catch"] },
    rule: { kind: "distinct_entries", target: 2 },
  });
  objectives[12] = objective("expert-1", "expert", 1_000, {
    filter: { category: "fish", sources: ["fishing.catch"] },
    rule: { kind: "best_value", target: 100 },
  });

  return {
    version: 1,
    seasonId: "2026-08",
    themeId: "rivers-and-lakes",
    themeName: "강과 호수의 달",
    primaryCategories: ["fish", "life"],
    supportCategory: "cooking",
    objectives,
    diversityTracks: [
      {
        id: "fish-variety",
        label: "서로 다른 어종",
        filter: { category: "fish", sources: ["fishing.catch"] },
        pointsPerEntry: 300,
        maxEntries: 10,
      },
      {
        id: "field-variety",
        label: "서로 다른 현장",
        filter: { category: "life", sources: ["life.complete"] },
        pointsPerEntry: 200,
        maxEntries: 10,
      },
    ],
    recordTracks: [
      {
        id: "fish-size",
        label: "월간 최대어",
        filter: { category: "fish", sources: ["fishing.catch"] },
        milestones: [
          { value: 50, score: 500 },
          { value: 100, score: 1_000 },
          { value: 150, score: 1_500 },
        ],
      },
      {
        id: "fish-size-rare",
        label: "희귀어 최대 기록",
        filter: {
          category: "fish",
          entryIds: ["rare-fish"],
          sources: ["fishing.catch"],
        },
        milestones: [
          { value: 50, score: 500 },
          { value: 100, score: 1_000 },
          { value: 150, score: 1_500 },
        ],
      },
    ],
    ...overrides,
  };
}

function event(
  entryId: string,
  overrides: Partial<CodexResearchEvent> = {},
): CodexResearchEvent {
  return {
    category: "fish",
    entryId,
    amount: 1,
    source: "fishing.catch",
    ...overrides,
  };
}

describe("codex research season definition", () => {
  it.each([
    ["2026-08", "2026-07-31T15:00:00.000Z", "2026-08-31T15:00:00.000Z"],
    ["2026-12", "2026-11-30T15:00:00.000Z", "2026-12-31T15:00:00.000Z"],
    ["2028-02", "2028-01-31T15:00:00.000Z", "2028-02-29T15:00:00.000Z"],
  ])("builds the exact KST calendar window for %s", (seasonId, start, end) => {
    const window = kstCodexResearchSeasonWindow(seasonId);

    expect(window.startAt.toISOString()).toBe(start);
    expect(window.endAt.toISOString()).toBe(end);
    expect(isCodexResearchSeasonOpen(window, new Date(start))).toBe(true);
    expect(isCodexResearchSeasonOpen(window, new Date(end))).toBe(false);
  });

  it("accepts exactly 18 visible objectives and the 12k/5k/3k budget", () => {
    const definition = validCodexResearchDefinition();
    const window = kstCodexResearchSeasonWindow(definition.seasonId);

    expect(validateCodexResearchSeasonDefinition(definition, window)).toBeNull();
    expect(definition.objectives).toHaveLength(18);
    expect(definition.objectives.reduce((sum, item) => sum + item.points, 0))
      .toBe(12_000);
    expect(definition.diversityTracks.reduce(
      (sum, track) => sum + track.pointsPerEntry * track.maxEntries,
      0,
    )).toBe(5_000);
    expect(definition.recordTracks.reduce(
      (sum, track) => sum + (track.milestones.at(-1)?.score ?? 0),
      0,
    )).toBe(3_000);
  });

  it.each([
    ["season window", (definition: CodexResearchDefinitionSnapshot) => ({
      definition,
      window: { ...kstCodexResearchSeasonWindow("2026-08"), endAt: NOW },
    })],
    ["objective group counts", (definition: CodexResearchDefinitionSnapshot) => {
      definition.objectives.pop();
      return { definition, window: kstCodexResearchSeasonWindow("2026-08") };
    }],
    ["objective IDs", (definition: CodexResearchDefinitionSnapshot) => {
      definition.objectives[1].id = definition.objectives[0].id;
      return { definition, window: kstCodexResearchSeasonWindow("2026-08") };
    }],
    ["category roles", (definition: CodexResearchDefinitionSnapshot) => {
      definition.supportCategory = definition.primaryCategories[0];
      return { definition, window: kstCodexResearchSeasonWindow("2026-08") };
    }],
    ["source/category", (definition: CodexResearchDefinitionSnapshot) => {
      definition.objectives[0].filter.sources = ["life.complete"];
      return { definition, window: kstCodexResearchSeasonWindow("2026-08") };
    }],
    ["theme category", (definition: CodexResearchDefinitionSnapshot) => {
      definition.objectives[0].filter = {
        category: "monster",
        sources: ["hunt.victory"],
      };
      return { definition, window: kstCodexResearchSeasonWindow("2026-08") };
    }],
    ["objective budget", (definition: CodexResearchDefinitionSnapshot) => {
      definition.objectives[0].points += 1;
      return { definition, window: kstCodexResearchSeasonWindow("2026-08") };
    }],
    ["diversity budget", (definition: CodexResearchDefinitionSnapshot) => {
      definition.diversityTracks[0].maxEntries += 1;
      return { definition, window: kstCodexResearchSeasonWindow("2026-08") };
    }],
    ["record milestones", (definition: CodexResearchDefinitionSnapshot) => {
      definition.recordTracks[0].milestones[1].value = 40;
      return { definition, window: kstCodexResearchSeasonWindow("2026-08") };
    }],
  ])("rejects invalid %s without rewriting it", (_label, mutate) => {
    const definition = structuredClone(validCodexResearchDefinition());
    const invalid = mutate(definition);
    const beforeValidation = structuredClone(invalid.definition);

    expect(validateCodexResearchSeasonDefinition(
      invalid.definition,
      invalid.window,
    )).toEqual(expect.any(String));
    expect(invalid.definition).toEqual(beforeValidation);
  });
});

describe("codex research progress evaluator", () => {
  it("starts with an explicit bounded zero state", () => {
    expect(emptyCodexResearchProgress()).toEqual({
      score: 0,
      objectiveProgress: {
        objectives: {},
        diversityEntries: {},
        recordValues: {},
      },
      objectiveCompletedCount: 0,
      diversityScore: 0,
      recordScore: 0,
      scoreReachedAt: null,
      representativeRecord: null,
    });
  });

  it("caps count progress and awards an objective only once", () => {
    const definition = validCodexResearchDefinition();
    const first = applyCodexResearchEvents(
      definition,
      emptyCodexResearchProgress(),
      [event("fish-basic-1", { amount: 5 })],
      NOW,
    );
    const repeated = applyCodexResearchEvents(
      definition,
      first.next,
      [event("fish-basic-1", { amount: 99 })],
      new Date("2026-08-21T00:00:00.000Z"),
    );

    expect(first.changed).toBe(true);
    expect(first.next.objectiveProgress.objectives["basic-1"]).toMatchObject({
      value: 3,
      completedAt: NOW.toISOString(),
    });
    expect(first.next.objectiveCompletedCount).toBe(1);
    expect(first.next.score).toBe(700); // 400 objective + 300 first diversity entry
    expect(repeated.changed).toBe(false);
    expect(repeated.next).toEqual(first.next);
  });

  it("deduplicates distinct entries and keeps the highest record", () => {
    const definition = validCodexResearchDefinition();
    const result = applyCodexResearchEvents(
      definition,
      emptyCodexResearchProgress(),
      [
        event("carp", { bestValue: 60 }),
        event("carp", { amount: 4, bestValue: 55 }),
        event("trout", { bestValue: 120 }),
      ],
      NOW,
    );

    expect(result.next.objectiveProgress.objectives["field-1"]).toMatchObject({
      value: 2,
      seenEntryKeys: ["fish:carp", "fish:trout"],
      completedAt: NOW.toISOString(),
    });
    expect(result.next.objectiveProgress.objectives["expert-1"].value).toBe(120);
    expect(result.next.diversityScore).toBe(600);
    expect(result.next.recordScore).toBe(1_000);
    expect(result.next.representativeRecord).toMatchObject({
      trackId: "fish-size",
      category: "fish",
      entryId: "trout",
      value: 120,
    });
  });

  it("reaches but never exceeds the 20,000 point season cap", () => {
    const definition = validCodexResearchDefinition();
    const objectiveEvents = definition.objectives.flatMap((item, index) => {
      if (item.rule.kind === "distinct_entries") {
        return Array.from({ length: item.rule.target }, (_, entryIndex) =>
          event(`distinct-${index}-${entryIndex}`, { amount: 3, bestValue: 200 }));
      }
      const entryId = item.filter.entryIds?.[0] ?? `open-${index}`;
      return [event(entryId, {
        amount: item.rule.kind === "count" ? item.rule.target : 3,
        bestValue: item.rule.kind === "best_value" ? item.rule.target : 200,
      })];
    });
    const diversityEvents = [
      ...Array.from({ length: 20 }, (_, index) =>
        event(index === 0 ? "rare-fish" : `variety-${index}`, {
          amount: 3,
          bestValue: 200,
        })),
      ...Array.from({ length: 10 }, (_, index): CodexResearchEvent => ({
        category: "life",
        entryId: `field-${index}`,
        amount: 1,
        source: "life.complete",
      })),
    ];
    const result = applyCodexResearchEvents(
      definition,
      emptyCodexResearchProgress(),
      [...objectiveEvents, ...diversityEvents],
      NOW,
    );

    expect(result.next.objectiveCompletedCount).toBe(18);
    expect(result.next.diversityScore).toBe(5_000);
    expect(result.next.recordScore).toBe(3_000);
    expect(result.next.score).toBe(20_000);

    const overflowAttempt = applyCodexResearchEvents(
      definition,
      result.next,
      [event("another", { amount: Number.MAX_SAFE_INTEGER, bestValue: 999 })],
      NOW,
    );
    expect(overflowAttempt.next.score).toBe(20_000);
  });

  it("rejects malformed event quantities and record values before mutation", () => {
    const definition = validCodexResearchDefinition();
    const previous = emptyCodexResearchProgress();

    expect(() => applyCodexResearchEvents(
      definition,
      previous,
      [event("carp", { amount: Number.NaN })],
      NOW,
    )).toThrow("amount");
    expect(() => applyCodexResearchEvents(
      definition,
      previous,
      [event("carp", { bestValue: Number.POSITIVE_INFINITY })],
      NOW,
    )).toThrow("bestValue");
    expect(previous).toEqual(emptyCodexResearchProgress());
  });

  it("returns the same state for a valid nonmatching event", () => {
    const definition = validCodexResearchDefinition();
    const previous = emptyCodexResearchProgress();
    const result = applyCodexResearchEvents(
      definition,
      previous,
      [{
        category: "monster",
        entryId: "bat",
        amount: 1,
        source: "hunt.victory",
      }],
      NOW,
    );

    expect(result).toEqual({ changed: false, next: previous });
  });

  it("rejects an inconsistent stored score instead of decreasing it", () => {
    const definition = validCodexResearchDefinition();
    const corrupted = {
      ...emptyCodexResearchProgress(),
      score: 9_999,
      scoreReachedAt: "2026-08-01T00:00:00.000Z",
    };

    expect(() => applyCodexResearchEvents(
      definition,
      corrupted,
      [event("fish-basic-1", { amount: 3 })],
      NOW,
    )).toThrow("stored research progress is inconsistent");
    expect(corrupted.score).toBe(9_999);
  });

  it("rejects rolled-over achievement dates and a zero score reach time", () => {
    const definition = validCodexResearchDefinition();
    const completed = applyCodexResearchEvents(
      definition,
      emptyCodexResearchProgress(),
      [event("fish-basic-1", { amount: 3 })],
      NOW,
    ).next;
    const rolledOver = structuredClone(completed);
    rolledOver.objectiveProgress.objectives["basic-1"].completedAt =
      "2026-02-30T00:00:00.000Z";
    const zeroWithReachTime = {
      ...emptyCodexResearchProgress(),
      scoreReachedAt: NOW.toISOString(),
    };

    expect(() => applyCodexResearchEvents(
      definition,
      rolledOver,
      [],
      NOW,
    )).toThrow("stored research progress is inconsistent");
    expect(() => applyCodexResearchEvents(
      definition,
      zeroWithReachTime,
      [],
      NOW,
    )).toThrow("stored research progress is inconsistent");
  });
});
