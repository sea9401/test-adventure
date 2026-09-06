import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), season: vi.fn(), ensure: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.user }));
vi.mock("@/lib/server/pvp/season", () => ({ getOrCreateCurrentSeason: mocks.season }));
vi.mock("@/lib/server/pvp/arenaTournamentService", () => ({ ensureArenaTournament: mocks.ensure }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
import { GET } from "./route";
const now = new Date("2026-09-06T11:00:00Z");
const season = { id: "2026-W36", startAt: new Date("2026-08-30T15:00:00Z"), endAt: new Date("2026-09-06T15:00:00Z") };
describe("arena state season reuse", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.user.mockResolvedValue("viewer");
    mocks.season.mockResolvedValue(season);
    mocks.select.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([]) }) });
    mocks.select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ rating: 1234, wins: 2, losses: 1, draws: 0 }]) }) }) });
  });
  afterEach(() => vi.useRealTimers());
  it("preserves current ratings and supplies the resolved season for Sunday self-healing", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, state: { score: 1234, season: { id: "2026-W36", phase: "tournament", rating: 1234, wins: 2 } } });
    expect(mocks.ensure).toHaveBeenCalledWith(now, season);
  });
  it("does not run tournament self-healing during ranked play", async () => {
    vi.setSystemTime(new Date("2026-09-05T11:00:00Z"));
    const response = await GET();
    expect((await response.json()).state.season.phase).toBe("ranked");
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated requests before database work", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.season).not.toHaveBeenCalled();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});
