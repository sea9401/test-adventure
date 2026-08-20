import { describe, expect, it } from "vitest";
import type {
  CodexResearchDefinitionSnapshot,
  CodexResearchObjective,
} from "./codexResearch";
import { CODEX_RESEARCH_GROUP_COUNTS } from "./codexResearch";
import {
  buildCodexResearchSettlementPreview,
  codexResearchConfirmation,
  previewCodexResearchDefinition,
  type CodexResearchSettlementPreviewCandidate,
} from "./codexResearchOps";

function objective(
  id: string,
  group: CodexResearchObjective["group"],
  points: number,
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
  };
}

function definition(): CodexResearchDefinitionSnapshot {
  return {
    version: 1,
    seasonId: "2026-09",
    themeId: "rivers-and-lakes",
    themeName: "강과 호수의 달",
    primaryCategories: ["fish", "life"],
    supportCategory: "cooking",
    objectives: [
      ...Array.from({ length: CODEX_RESEARCH_GROUP_COUNTS.basic }, (_, index) =>
        objective(`basic-${index + 1}`, "basic", 400)),
      ...Array.from({ length: CODEX_RESEARCH_GROUP_COUNTS.field }, (_, index) =>
        objective(`field-${index + 1}`, "field", 600)),
      ...Array.from({ length: CODEX_RESEARCH_GROUP_COUNTS.expert }, (_, index) =>
        objective(`expert-${index + 1}`, "expert", 1_000)),
      ...Array.from({ length: CODEX_RESEARCH_GROUP_COUNTS.challenge }, (_, index) =>
        objective(`challenge-${index + 1}`, "challenge", 1_000)),
    ],
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
  };
}

function candidate(
  rank: number,
  score: number,
): CodexResearchSettlementPreviewCandidate {
  const objectiveScore = Math.min(score, 12_000);
  const remaining = score - objectiveScore;
  const diversityScore = Math.min(remaining, 5_000);
  return {
    userId: `user-${rank}`,
    finalRank: rank,
    score,
    objectiveCompletedCount: Math.min(rank, 18),
    diversityScore,
    recordScore: remaining - diversityScore,
  };
}

describe("codex research operations previews", () => {
  it("summarizes an exact valid future definition without mutating it", () => {
    const input = definition();
    const before = structuredClone(input);

    expect(previewCodexResearchDefinition(
      input,
      new Date("2026-08-20T00:00:00.000Z"),
    )).toEqual({
      seasonId: "2026-09",
      themeId: "rivers-and-lakes",
      themeName: "강과 호수의 달",
      version: 1,
      startAt: "2026-08-31T15:00:00.000Z",
      endAt: "2026-09-30T15:00:00.000Z",
      primaryCategories: ["fish", "life"],
      supportCategory: "cooking",
      objectiveCount: 18,
      groupCounts: { basic: 6, field: 6, expert: 4, challenge: 2 },
      objectiveScore: 12_000,
      diversityScore: 5_000,
      recordScore: 3_000,
      schedulable: true,
    });
    expect(input).toEqual(before);
  });

  it("marks a definition unschedulable at the exact start boundary", () => {
    expect(previewCodexResearchDefinition(
      definition(),
      new Date("2026-08-31T15:00:00.000Z"),
    ).schedulable).toBe(false);
  });

  it("builds all tier counts and only the top ten rows", () => {
    const scores = [
      19_000, 17_500, 17_000, 16_800, 16_600, 16_400, 16_200, 16_100,
      16_000, 16_000, 16_000, 15_000, 12_000, 8_000, 4_000, 3_999,
    ];
    const preview = buildCodexResearchSettlementPreview(
      "2026-09",
      scores.map((score, index) => candidate(index + 1, score)),
    );

    expect(preview).toMatchObject({
      seasonId: "2026-09",
      participantCount: 16,
      tierCounts: {
        bronze: 1,
        silver: 1,
        gold: 2,
        platinum: 1,
        diamond: 9,
        legendary: 1,
      },
      untieredCount: 1,
    });
    expect(preview.top).toHaveLength(10);
    expect(preview.top[0]).toEqual({
      userId: "user-1",
      rank: 1,
      score: 19_000,
      tier: "legendary",
    });
    expect(preview.top[9]).toEqual({
      userId: "user-10",
      rank: 10,
      score: 16_000,
      tier: "diamond",
    });
  });

  it("rejects noncontiguous ranks and impossible score components", () => {
    const rankGap = [candidate(1, 4_000), candidate(3, 3_000)];
    const impossible = candidate(1, 20_000);
    impossible.recordScore = 3_001;

    expect(() => buildCodexResearchSettlementPreview("2026-09", rankGap))
      .toThrow("codex research settlement preview candidates are invalid");
    expect(() => buildCodexResearchSettlementPreview("2026-09", [impossible]))
      .toThrow("codex research settlement preview candidates are invalid");
  });

  it("returns the exact destructive-operation confirmation strings", () => {
    expect(codexResearchConfirmation("schedule", "2026-09"))
      .toBe("SCHEDULE 2026-09");
    expect(codexResearchConfirmation("settle", "2026-09"))
      .toBe("SETTLE 2026-09");
    expect(codexResearchConfirmation("resettle", "2026-09"))
      .toBe("RESETTLE 2026-09");
    expect(codexResearchConfirmation("award-trophies", "2026-09"))
      .toBe("AWARD 2026-09");
  });
});
