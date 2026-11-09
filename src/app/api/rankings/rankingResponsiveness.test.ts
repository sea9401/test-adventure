import { performance } from "node:perf_hooks";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/db", () => ({ db: { execute } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => "u-me" }));
vi.mock("@/lib/server/isAdmin", () => ({ getAdminEmailsList: () => [] }));
vi.mock("@/lib/server/museunCosmetics", () => ({
  readMuseunCosmeticAppearanceMap: async () => new Map(),
}));
vi.mock("@/lib/server/ugcSafety", () => ({ readBlockedUserIds: async () => [] }));

beforeEach(() => {
  vi.resetModules();
  execute.mockReset();
});
afterEach(() => vi.restoreAllMocks());

function candidate(index: number) {
  return {
    user_id: index === 6 ? "u-me" : `u-${index}`,
    name: `모험가${index}`,
    avatar: "male1",
    bannedUntil: null as string | null,
    character_save: { level: 30 },
    equipment_save: {}, proficiency_save: {}, skills_save: {},
    adventure_save: {}, quests_save: {}, fishing_codex_save: {},
    updated_at: new Date(Date.UTC(2026, 8, 14, 0, 0, index)),
  };
}

// 생활 숙련·도감 완성도도 전 유저 세이브를 계산하므로 양보 없이 돌면 서버 전체가 수 초 멈춘다.
describe.each([
  ["combatPower", "character_save"],
  ["achievementScore", "character_save"],
  ["lifeMastery", "farm_save"],
  ["codexCompletion", "character_save"],
] as const)("%s ranking responsiveness", (metric, probeField) => {
  const request = () => new Request(`http://localhost/api/rankings?metric=${metric}`);

  it("processes other work during scoring while preserving all eligible rows and ties", async () => {
    const { GET } = await import("./route");
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock += 8);
    const visited = new Set<number>();
    let visitedAtPulse = 0;
    let pulse: Promise<void> | undefined;
    const rows = Array.from({ length: 12 }, (_, index) => Object.defineProperty({
      ...candidate(index),
      bannedUntil: index === 5 ? "9999-12-31T00:00:00.000Z" : null,
    }, probeField, {
      enumerable: true,
      get() {
        visited.add(index);
        if (!pulse) pulse = nextTurn().then(() => { visitedAtPulse = visited.size; });
        return probeField === "farm_save" ? {} : { level: 30 };
      },
    }));
    execute.mockResolvedValue({ rows });

    // Concurrent cold misses must wait for one complete ranking, never a partial result.
    const responses = await Promise.all([GET(request()), GET(request())]);
    const results = await Promise.all(responses.map((response) => response.json()));
    await pulse;
    expect(visitedAtPulse).toBeGreaterThan(0);
    expect(visitedAtPulse).toBeLessThan(11);
    expect(visited.size).toBe(11);
    expect(visited.has(5)).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    expect(results[0]).toEqual(results[1]);
    expect(results[0].list.map((row: { name: string }) => row.name))
      .toEqual(rows.filter((_, index) => index !== 5).map((row) => row.name));
    expect(results[0].list.map((row: { rank: number }) => row.rank))
      .toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    expect(results[0].me).toMatchObject({ name: "모험가6", rank: 6 });
  });

  it("retains the 30-second cache and shares concurrent expired refreshes", async () => {
    const { GET } = await import("./route");
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    execute.mockResolvedValue({ rows: [candidate(6)] });
    const first = await (await GET(request())).json();
    now += 29_999;
    expect(await (await GET(request())).json()).toEqual(first);
    expect(execute).toHaveBeenCalledOnce();
    now += 1;
    execute.mockResolvedValue({ rows: [{ ...candidate(6), name: "갱신된이름" }] });
    const responses = await Promise.all([GET(request()), GET(request())]);
    const results = await Promise.all(responses.map((response) => response.json()));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].me.name).toBe("갱신된이름");
  });

  it("discards a failed partial computation and allows the next request to retry", async () => {
    const { GET } = await import("./route");
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock += 8);
    const failure = new Error("score calculation failed");
    let fail = true;
    execute.mockResolvedValue({ rows: [candidate(0), Object.defineProperty({ ...candidate(6) }, probeField, {
      enumerable: true,
      get() {
        if (fail) throw failure;
        return probeField === "farm_save" ? {} : { level: 30 };
      },
    })] });
    await expect(GET(request())).rejects.toBe(failure);
    fail = false;
    const result = await (await GET(request())).json();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.list).toHaveLength(2);
    expect(result.me).toMatchObject({ name: "모험가6", rank: 2 });
  });
});
