import { describe, expect, it, vi } from "vitest";
import type { CodexResearchSeasonTrophyHistory } from "@/adventure/data/v2/codexResearchRanking";
import type { CodexResearchSeasonState } from "./codexResearchRepository";
import type { CodexResearchFinalist } from "./codexResearchTrophies";
import {
  createCodexResearchHonorPublisher,
  type CodexResearchHonorPublicationRuntime,
} from "./codexResearchPublication";

const NOW = new Date("2026-09-01T00:00:00.000Z");
const SETTLED = new Date("2026-08-31T16:00:00.000Z");

function season(): CodexResearchSeasonState {
  return {
    seasonId: "2026-08",
    themeId: "rivers-and-lakes",
    definition: { version: 1, seasonId: "2026-08", themeId: "rivers-and-lakes", themeName: "강과 호수의 달" } as CodexResearchSeasonState["definition"],
    startAt: new Date("2026-07-31T15:00:00.000Z"),
    endAt: new Date("2026-08-31T15:00:00.000Z"),
    status: "closed",
    settledAt: SETTLED,
    publishedAt: null,
  };
}

function finalist(userId: string, finalRank: number, finalTier: CodexResearchFinalist["finalTier"]): CodexResearchFinalist {
  const score = finalTier === "legendary" ? 19_000 : finalTier === "diamond" ? 17_000 : 13_000;
  return { userId, score, objectiveCompletedCount: 18, diversityScore: 4_000, recordScore: 3_000, finalRank, finalTier, representativeRecord: null };
}

function trophy(value: CodexResearchFinalist): CodexResearchSeasonTrophyHistory {
  const metadata = {
    seasonId: "2026-08",
    themeId: "rivers-and-lakes",
    themeName: "강과 호수의 달",
    finalRank: value.finalRank,
    score: value.score,
    objectiveCompletedCount: value.objectiveCompletedCount,
    objectiveScore: value.score - value.diversityScore - value.recordScore,
    diversityScore: value.diversityScore,
    recordScore: value.recordScore,
    representativeRecord: null,
    settledAt: SETTLED.toISOString(),
    firstPlaceEngraving: value.finalRank === 1,
  };
  return { trophyId: "research:2026-08", kind: "research_season", currentTier: value.finalTier, tierAchievedAt: { [value.finalTier]: SETTLED.toISOString() }, catalogVersion: 1, seasonMetadata: metadata };
}

function fixture(values: CodexResearchFinalist[], options: { existing?: string[]; trophies?: Array<{ userId: string; history: CodexResearchSeasonTrophyHistory }> } = {}) {
  const calls: string[] = [];
  const notifications: unknown[] = [];
  const feeds: unknown[] = [];
  const existing = new Set(options.existing ?? []);
  const runtime: CodexResearchHonorPublicationRuntime<object> = {
    lockSeason: vi.fn(async () => { calls.push("lock"); return season(); }),
    readFinalists: vi.fn(async () => { calls.push("finalists"); return values; }),
    readTrophies: vi.fn(async () => { calls.push("trophies"); return options.trophies ?? values.map((value) => ({ userId: value.userId, history: trophy(value) })); }),
    claimChannel: vi.fn(async (_executor, _seasonId, userId, channel) => {
      calls.push(`claim:${channel}:${userId}`);
      return existing.has(`${channel}:${userId}`) ? "existing" : "created";
    }),
    writeNotification: vi.fn(async (_executor, userId, payload) => { calls.push(`notify:${userId}`); notifications.push(payload); }),
    resolveActorName: vi.fn(async (_executor, userId) => `${userId}-name`),
    writeFeed: vi.fn(async (_executor, userId, actorName, payload) => { calls.push(`feed:${userId}`); feeds.push({ userId, actorName, payload }); }),
    markPublished: vi.fn(async () => { calls.push("publish"); return NOW; }),
  };
  return { runtime, calls, notifications, feeds };
}

describe("codex research honor publication", () => {
  it("publishes every personal notice but feeds only diamond and legendary", async () => {
    const values = [finalist("legend", 1, "legendary"), finalist("diamond", 4, "diamond"), finalist("gold", 12, "gold")];
    const f = fixture(values);
    const publish = createCodexResearchHonorPublisher(f.runtime);

    await expect(publish({}, { seasonId: "2026-08", now: NOW, feedEnabled: true }))
      .resolves.toMatchObject({ notificationCreatedCount: 3, feedCreatedCount: 2, publishedAt: NOW.toISOString() });
    expect(f.notifications).toHaveLength(3);
    expect(f.feeds.map((entry) => (entry as { userId: string }).userId)).toEqual(["legend", "diamond"]);
    expect(f.calls.at(-1)).toBe("publish");
  });

  it("supports zero finalists and later fills only a previously disabled feed channel", async () => {
    const empty = fixture([]);
    await expect(createCodexResearchHonorPublisher(empty.runtime)({}, { seasonId: "2026-08", now: NOW, feedEnabled: false }))
      .resolves.toMatchObject({ notificationCreatedCount: 0, feedCreatedCount: 0 });
    expect(empty.calls).toEqual(["lock", "finalists", "trophies", "publish"]);

    const winner = finalist("legend", 1, "legendary");
    const rerun = fixture([winner], { existing: ["notification:legend"] });
    await expect(createCodexResearchHonorPublisher(rerun.runtime)({}, { seasonId: "2026-08", now: NOW, feedEnabled: true }))
      .resolves.toMatchObject({ notificationExistingCount: 1, feedCreatedCount: 1 });
    expect(rerun.notifications).toHaveLength(0);
    expect(rerun.feeds).toHaveLength(1);
  });

  it("rejects missing or conflicting trophies before claiming a channel", async () => {
    const winner = finalist("legend", 1, "legendary");
    const f = fixture([winner], { trophies: [] });
    await expect(createCodexResearchHonorPublisher(f.runtime)({}, { seasonId: "2026-08", now: NOW, feedEnabled: true }))
      .rejects.toMatchObject({ code: "trophies_not_published" });
    expect(f.runtime.claimChannel).not.toHaveBeenCalled();
    expect(f.runtime.markPublished).not.toHaveBeenCalled();
  });

  it("does not mark the season published after a channel write failure", async () => {
    const f = fixture([finalist("legend", 1, "legendary")]);
    vi.mocked(f.runtime.writeNotification).mockRejectedValueOnce(new Error("write failed"));
    await expect(createCodexResearchHonorPublisher(f.runtime)({}, { seasonId: "2026-08", now: NOW, feedEnabled: true }))
      .rejects.toThrow("write failed");
    expect(f.runtime.markPublished).not.toHaveBeenCalled();
  });
});
