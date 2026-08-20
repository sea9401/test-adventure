import { describe, expect, it, vi } from "vitest";
import type {
  CodexResearchDefinitionSnapshot,
  CodexResearchObjective,
} from "@/adventure/data/v2/codexResearch";
import { kstCodexResearchSeasonWindow } from "@/adventure/data/v2/codexResearch";
import type { CodexResearchSeasonState } from "./codexResearchRepository";
import type { CodexResearchSettlementCandidate } from "./codexResearchSettlement";
import {
  CodexResearchOpsError,
  createCodexResearchResettlement,
  createCodexResearchSeasonSchedulerForOps,
  createCodexResearchSettlementPreviewForOps,
} from "./codexResearchOps";

const NOW = new Date("2026-08-31T15:00:01.000Z");

function definition(seasonId = "2026-08"): CodexResearchDefinitionSnapshot {
  const groups: Array<[CodexResearchObjective["group"], number, number]> = [
    ["basic", 6, 400],
    ["field", 6, 600],
    ["expert", 4, 1_000],
    ["challenge", 2, 1_000],
  ];
  return {
    version: 1,
    seasonId,
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
    settledAt: NOW,
    publishedAt: null,
    ...overrides,
  };
}

function candidate(
  rank: number,
  score = 18_000,
): CodexResearchSettlementCandidate {
  return {
    userId: `user-${rank}`,
    finalRank: rank,
    score,
    objectiveCompletedCount: 18,
    diversityScore: 3_000,
    recordScore: 3_000,
  };
}

describe("codex research season operations service", () => {
  it("previews official candidate order without writing", async () => {
    const readSeason = vi.fn(async () => season());
    const readCandidates = vi.fn(async () => [
      candidate(1),
      candidate(2, 16_000),
    ]);
    const preview = createCodexResearchSettlementPreviewForOps({
      readSeason,
      readCandidates,
    });

    await expect(preview({}, {
      seasonId: "2026-08",
      adminEmails: ["admin@example.com"],
      now: NOW,
    })).resolves.toMatchObject({
      seasonId: "2026-08",
      participantCount: 2,
      top: [
        { userId: "user-1", rank: 1, tier: "legendary" },
        { userId: "user-2", rank: 2, tier: "diamond" },
      ],
    });
    expect(readCandidates).toHaveBeenCalledWith(
      {},
      "2026-08",
      ["admin@example.com"],
      NOW,
    );
  });

  it("rejects scheduling at the start boundary before calling the writer", async () => {
    const schedule = vi.fn();
    const run = createCodexResearchSeasonSchedulerForOps({ schedule });
    const future = definition("2026-09");

    await expect(run({}, {
      definition: future,
      now: new Date("2026-08-31T15:00:00.000Z"),
    })).rejects.toMatchObject({
      code: "season_not_future",
      status: 409,
    });
    expect(schedule).not.toHaveBeenCalled();
  });

  it("revalidates and clones a future definition before scheduling", async () => {
    const schedule = vi.fn(async (_executor, snapshot) => ({
      seasonId: snapshot.seasonId,
    }));
    const run = createCodexResearchSeasonSchedulerForOps({ schedule });
    const future = definition("2026-09");

    await expect(run({}, {
      definition: future,
      now: new Date("2026-08-20T00:00:00.000Z"),
    })).resolves.toEqual({ seasonId: "2026-09" });
    expect(schedule.mock.calls[0][1]).toEqual(future);
    expect(schedule.mock.calls[0][1]).not.toBe(future);
  });

  it("rejects an open season and published trophies before reopening", async () => {
    const openCalls: string[] = [];
    const open = createCodexResearchResettlement({
      lockSeason: vi.fn(async () => {
        openCalls.push("lock");
        return season({ status: "active", settledAt: null });
      }),
      countTrophies: vi.fn(async () => {
        openCalls.push("count");
        return 0;
      }),
      markResettling: vi.fn(async () => {
        openCalls.push("mark");
      }),
      readCandidates: vi.fn(async () => []),
      writeResults: vi.fn(async () => undefined),
      closeSeason: vi.fn(async () => undefined),
    });
    await expect(open({}, {
      seasonId: "2026-08",
      adminEmails: [],
      now: NOW,
    })).rejects.toMatchObject({ code: "season_not_ready" });
    expect(openCalls).toEqual(["lock"]);

    const trophyCalls: string[] = [];
    const published = createCodexResearchResettlement({
      lockSeason: vi.fn(async () => {
        trophyCalls.push("lock");
        return season();
      }),
      countTrophies: vi.fn(async () => {
        trophyCalls.push("count");
        return 1;
      }),
      markResettling: vi.fn(async () => {
        trophyCalls.push("mark");
      }),
      readCandidates: vi.fn(async () => []),
      writeResults: vi.fn(async () => undefined),
      closeSeason: vi.fn(async () => undefined),
    });
    await expect(published({}, {
      seasonId: "2026-08",
      adminEmails: [],
      now: NOW,
    })).rejects.toMatchObject({ code: "trophies_already_published" });
    expect(trophyCalls).toEqual(["lock", "count"]);

    const publicationCalls: string[] = [];
    const publiclyVisible = createCodexResearchResettlement({
      lockSeason: vi.fn(async () => {
        publicationCalls.push("lock");
        return season({ publishedAt: NOW });
      }),
      countTrophies: vi.fn(async () => {
        publicationCalls.push("count");
        return 0;
      }),
      markResettling: vi.fn(async () => {
        publicationCalls.push("mark");
      }),
      readCandidates: vi.fn(async () => []),
      writeResults: vi.fn(async () => undefined),
      closeSeason: vi.fn(async () => undefined),
    });
    await expect(publiclyVisible({}, {
      seasonId: "2026-08",
      adminEmails: [],
      now: NOW,
    })).rejects.toMatchObject({ code: "season_already_published" });
    expect(publicationCalls).toEqual(["lock"]);
  });

  it("resettles in one guarded sequence and returns exact tier counts", async () => {
    const calls: string[] = [];
    const writes: unknown[] = [];
    const resettle = createCodexResearchResettlement({
      lockSeason: vi.fn(async () => {
        calls.push("lock");
        return season();
      }),
      countTrophies: vi.fn(async () => {
        calls.push("count");
        return 0;
      }),
      markResettling: vi.fn(async () => {
        calls.push("mark");
      }),
      readCandidates: vi.fn(async () => {
        calls.push("candidates");
        return [candidate(1), candidate(2, 16_000)];
      }),
      writeResults: vi.fn(async (_executor, _seasonId, results) => {
        calls.push("write");
        writes.push(...results);
      }),
      closeSeason: vi.fn(async () => {
        calls.push("close");
      }),
    });

    await expect(resettle({}, {
      seasonId: "2026-08",
      adminEmails: [],
      now: NOW,
    })).resolves.toMatchObject({
      status: "resettled",
      seasonId: "2026-08",
      participantCount: 2,
      tierCounts: { legendary: 1, diamond: 1 },
    });
    expect(calls).toEqual(["lock", "count", "mark", "candidates", "write", "close"]);
    expect(writes).toEqual([
      { userId: "user-1", finalRank: 1, finalTier: "legendary" },
      { userId: "user-2", finalRank: 2, finalTier: "diamond" },
    ]);
  });

  it("does not close after a failed result rewrite", async () => {
    const closeSeason = vi.fn();
    const resettle = createCodexResearchResettlement({
      lockSeason: vi.fn(async () => season()),
      countTrophies: vi.fn(async () => 0),
      markResettling: vi.fn(async () => undefined),
      readCandidates: vi.fn(async () => [candidate(1)]),
      writeResults: vi.fn(async () => {
        throw new Error("write failed");
      }),
      closeSeason,
    });

    await expect(resettle({}, {
      seasonId: "2026-08",
      adminEmails: [],
      now: NOW,
    })).rejects.toThrow("write failed");
    expect(closeSeason).not.toHaveBeenCalled();
  });

  it("exposes stable operation error fields", () => {
    const error = new CodexResearchOpsError(
      "season_not_found",
      404,
      "시즌이 없습니다.",
    );
    expect(error).toMatchObject({
      name: "CodexResearchOpsError",
      code: "season_not_found",
      status: 404,
      message: "시즌이 없습니다.",
    });
  });
});
