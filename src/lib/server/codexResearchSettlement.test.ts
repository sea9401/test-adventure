import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { db } from "@/db";
import type {
  CodexResearchDefinitionSnapshot,
  CodexResearchObjective,
} from "@/adventure/data/v2/codexResearch";
import { kstCodexResearchSeasonWindow } from "@/adventure/data/v2/codexResearch";
import type { CodexResearchSeasonState } from "./codexResearchRepository";
import {
  createCodexResearchSettlement,
  readCodexResearchSettlementCandidates,
  type CodexResearchSettlementCandidate,
} from "./codexResearchSettlement";

const END = new Date("2026-08-31T15:00:00.000Z");
const NOW = new Date("2026-08-31T15:00:01.000Z");

function definition(): CodexResearchDefinitionSnapshot {
  const groups: Array<[CodexResearchObjective["group"], number, number]> = [
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
    status: "active",
    settledAt: null,
    ...overrides,
  };
}

function candidate(
  rank: number,
  overrides: Partial<CodexResearchSettlementCandidate> = {},
): CodexResearchSettlementCandidate {
  return {
    userId: `user-${String(rank).padStart(2, "0")}`,
    finalRank: rank,
    score: 18_000,
    objectiveCompletedCount: 18,
    diversityScore: 3_000,
    recordScore: 3_000,
    ...overrides,
  };
}

function runtimeFixture(options: {
  season?: CodexResearchSeasonState;
  candidates?: CodexResearchSettlementCandidate[];
  writeError?: Error;
} = {}) {
  const calls: string[] = [];
  const writes: unknown[] = [];
  const runtime = {
    lockSeason: vi.fn(async () => {
      calls.push("lock-season");
      return options.season ?? season();
    }),
    markSettling: vi.fn(async () => {
      calls.push("mark-settling");
    }),
    readCandidates: vi.fn(async () => {
      calls.push("rank-finalists");
      return options.candidates ?? [];
    }),
    writeResults: vi.fn(async (_executor, _seasonId, results) => {
      calls.push("write-results");
      if (options.writeError) throw options.writeError;
      writes.push(...results);
    }),
    closeSeason: vi.fn(async () => {
      calls.push("close-season");
    }),
  };
  return { runtime, calls, writes };
}

describe("monthly codex research settlement", () => {
  it("allows the read-only candidate query on the global executor", () => {
    expectTypeOf<typeof db>()
      .toMatchTypeOf<Parameters<typeof readCodexResearchSettlementCandidates>[0]>();
  });

  it("rejects settlement before the exclusive season end", async () => {
    const fixture = runtimeFixture();
    const settle = createCodexResearchSettlement(fixture.runtime);

    await expect(settle({}, {
      seasonId: "2026-08",
      now: new Date(END.getTime() - 1),
      adminEmails: [],
    })).rejects.toThrow("season has not ended");
    expect(fixture.calls).toEqual(["lock-season"]);
  });

  it("fixes every final rank and tier before closing the season", async () => {
    const fixture = runtimeFixture({
      candidates: Array.from({ length: 12 }, (_, index) => candidate(index + 1)),
    });
    const settle = createCodexResearchSettlement(fixture.runtime);

    await expect(settle({}, {
      seasonId: "2026-08",
      now: NOW,
      adminEmails: ["admin@example.com"],
    })).resolves.toEqual({
      status: "settled",
      seasonId: "2026-08",
      participantCount: 12,
      tierCounts: {
        bronze: 0,
        silver: 0,
        gold: 0,
        platinum: 2,
        diamond: 7,
        legendary: 3,
      },
    });
    expect(fixture.calls).toEqual([
      "lock-season",
      "mark-settling",
      "rank-finalists",
      "write-results",
      "close-season",
    ]);
    expect(fixture.runtime.readCandidates).toHaveBeenCalledWith(
      {},
      "2026-08",
      ["admin@example.com"],
      NOW,
    );
    expect(fixture.writes).toEqual(expect.arrayContaining([
      { userId: "user-01", finalRank: 1, finalTier: "legendary" },
      { userId: "user-04", finalRank: 4, finalTier: "diamond" },
      { userId: "user-11", finalRank: 11, finalTier: "platinum" },
    ]));
  });

  it("returns an already-closed result without rewriting anything", async () => {
    const fixture = runtimeFixture({
      season: season({ status: "closed", settledAt: NOW }),
    });
    const settle = createCodexResearchSettlement(fixture.runtime);

    await expect(settle({}, {
      seasonId: "2026-08",
      now: NOW,
      adminEmails: [],
    })).resolves.toEqual({ status: "already_closed", seasonId: "2026-08" });
    expect(fixture.calls).toEqual(["lock-season"]);
  });

  it("does not close when final result persistence fails", async () => {
    const fixture = runtimeFixture({
      candidates: [candidate(1)],
      writeError: new Error("write failed"),
    });
    const settle = createCodexResearchSettlement(fixture.runtime);

    await expect(settle({}, {
      seasonId: "2026-08",
      now: NOW,
      adminEmails: [],
    })).rejects.toThrow("write failed");
    expect(fixture.calls).not.toContain("close-season");
  });

  it("rejects duplicate or non-contiguous official ranks", async () => {
    const fixture = runtimeFixture({
      candidates: [candidate(1), candidate(1, { userId: "user-02" })],
    });
    const settle = createCodexResearchSettlement(fixture.runtime);

    await expect(settle({}, {
      seasonId: "2026-08",
      now: NOW,
      adminEmails: [],
    })).rejects.toThrow("settlement candidates are invalid");
    expect(fixture.calls).not.toContain("write-results");
  });

  it("resumes settling and closes a season with no participants", async () => {
    const fixture = runtimeFixture({ season: season({ status: "settling" }) });
    const settle = createCodexResearchSettlement(fixture.runtime);

    await expect(settle({}, {
      seasonId: "2026-08",
      now: NOW,
      adminEmails: [],
    })).resolves.toMatchObject({ status: "settled", participantCount: 0 });
    expect(fixture.calls).toEqual([
      "lock-season",
      "mark-settling",
      "rank-finalists",
      "write-results",
      "close-season",
    ]);
  });
});
