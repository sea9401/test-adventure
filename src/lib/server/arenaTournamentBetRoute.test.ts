import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureArenaTournament: vi.fn(),
  placeArenaTournamentBet: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "viewer"),
}));

vi.mock("@/lib/server/pvp/arenaTournamentService", () => mocks);

import { POST } from "@/app/api/v2/arena/tournament/bet/route";

function req(body: unknown): Request {
  return new Request("http://t/api/v2/arena/tournament/bet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/arena/tournament/bet", () => {
  beforeEach(() => {
    mocks.ensureArenaTournament.mockReset();
    mocks.placeArenaTournamentBet.mockReset();
    mocks.ensureArenaTournament.mockResolvedValue({ kind: "ok" });
  });

  it("베팅 후 지갑과 은행 잔액을 함께 반환한다", async () => {
    mocks.placeArenaTournamentBet.mockResolvedValue({
      kind: "ok",
      amount: 3_000,
      gold: 500,
      bankedGold: 7_000,
    });

    const res = await POST(
      req({ matchId: "match-1", chosenUserId: "player-1", amount: 3_000 }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      amount: 3_000,
      gold: 500,
      bankedGold: 7_000,
    });
    expect(mocks.placeArenaTournamentBet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "viewer",
        matchId: "match-1",
        chosenUserId: "player-1",
        amount: 3_000,
      }),
    );
  });
});
