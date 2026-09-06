import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArenaTournamentBracket } from "./arenaTournament";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), transaction: vi.fn(), season: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("./season", () => ({ getOrCreateCurrentSeason: mocks.season }));
import { ensureArenaTournament } from "./arenaTournamentService";
import { pvpTournaments } from "@/db/schema";

const now = new Date("2026-09-06T11:00:00Z");
const season = { id: "2026-W36", startAt: new Date("2026-08-30T15:00:00Z"), endAt: new Date("2026-09-06T15:00:00Z"), status: "active", closedAt: null, rewardsGrantedAt: null };
function bracket(status: ArenaTournamentBracket["status"]): ArenaTournamentBracket {
  return { version: 2, seasonId: season.id, bracketSize: 0, minimumMatches: 10,
    generatedAt: now.toISOString(), startsAt: now.toISOString(), status,
    participants: [], matches: [], championUserId: null, rewards: [] };
}
function readRows(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) };
}

describe("arena tournament database work", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.season.mockResolvedValue(season);
  });
  it.each(["completed", "not_enough_players"] as const)("reads %s results without a transaction or combat snapshots", async (status) => {
    const saved = bracket(status);
    mocks.select.mockReturnValue(readRows([{ bracket: saved }]));
    const result = await ensureArenaTournament(now);
    expect(result).toEqual({ kind: "ok", seasonId: season.id, created: false, processedMatches: 0, bracket: saved });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledWith({ bracket: pvpTournaments.bracket });
  });
  it("reuses the season already resolved by this request", async () => {
    mocks.select.mockReturnValue(readRows([{ bracket: bracket("completed") }]));
    await ensureArenaTournament(now, season);
    expect(mocks.season).not.toHaveBeenCalled();
  });
  it.each(["scheduled", "in_progress", "missing"])("rechecks %s under both locks before advancing", async (status) => {
    mocks.select.mockReturnValue(readRows(status === "missing" ? [] : [{ bracket: bracket(status as ArenaTournamentBracket["status"]) }]));
    // Another request can finish or create the tournament before we acquire the locks.
    const saved = bracket("completed");
    const lock = vi.fn().mockReturnValue({ limit: () => Promise.resolve([{ bracket: saved }]) });
    const select = vi.fn().mockReturnValue({ from: () => ({ where: () => ({ for: lock }) }) });
    mocks.transaction.mockImplementation(async (run) => run({ select }));
    const result = await ensureArenaTournament(now);
    expect(result).toMatchObject({ kind: "ok", created: false, processedMatches: 0, bracket: saved });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(lock.mock.calls).toEqual([["update"], ["update"]]);
  });
  it("reads operator updates again instead of caching a terminal bracket", async () => {
    const first = bracket("completed");
    const updated = { ...first, championUserId: "corrected-winner" };
    mocks.select.mockReturnValueOnce(readRows([{ bracket: first }]));
    mocks.select.mockReturnValueOnce(readRows([{ bracket: updated }]));
    expect(await ensureArenaTournament(now)).toMatchObject({ bracket: { championUserId: null } });
    expect(await ensureArenaTournament(now)).toMatchObject({ bracket: { championUserId: "corrected-winner" } });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("does not suppress database read errors", async () => {
    mocks.select.mockImplementation(() => { throw new Error("database unavailable"); });
    await expect(ensureArenaTournament(now)).rejects.toThrow("database unavailable");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("does no tournament work outside the tournament phase", async () => {
    const result = await ensureArenaTournament(new Date("2026-09-05T11:00:00Z"));
    expect(result).toMatchObject({ kind: "not_open", phase: "ranked" });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
