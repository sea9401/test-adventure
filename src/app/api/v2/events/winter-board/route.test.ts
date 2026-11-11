import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "u-winter" as string | null,
  readWinterBoard: vi.fn(),
  rollWinterBoard: vi.fn(),
  claimWinterBoardMilestone: vi.fn(),
  buyWinterBoardItem: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/winterBoard", () => ({
  readWinterBoard: mocks.readWinterBoard,
  rollWinterBoard: mocks.rollWinterBoard,
  claimWinterBoardMilestone: mocks.claimWinterBoardMilestone,
  buyWinterBoardItem: mocks.buyWinterBoardItem,
  validWinterRequestId: (value: unknown) =>
    typeof value === "string" && value.length === 36,
}));

import { GET, POST } from "./route";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function post(body: unknown) {
  return POST(
    new Request("http://test.local/api/v2/events/winter-board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  mocks.userId = "u-winter";
  vi.clearAllMocks();
});

describe("겨울 말판 API", () => {
  it("로그인하지 않으면 401이다", async () => {
    mocks.userId = null;
    expect((await GET()).status).toBe(401);
    expect((await post({ action: "roll", requestId: REQUEST_ID })).status).toBe(401);
  });

  it("조회 결과와 실패 상태를 그대로 전달한다", async () => {
    mocks.readWinterBoard.mockResolvedValueOnce({ ok: true, dice: 2 });
    const okResponse = await GET();
    expect(okResponse.status).toBe(200);
    expect(await okResponse.json()).toEqual({ ok: true, dice: 2 });

    mocks.readWinterBoard.mockResolvedValueOnce({ ok: false, error: "event_ended", status: 410 });
    const ended = await GET();
    expect(ended.status).toBe(410);
    expect(await ended.json()).toEqual({ ok: false, error: "event_ended" });
  });

  it("굴리기는 요청 식별자가 올바를 때만 서비스로 넘긴다", async () => {
    expect((await post({ action: "roll", requestId: "short" })).status).toBe(400);
    expect(mocks.rollWinterBoard).not.toHaveBeenCalled();

    mocks.rollWinterBoard.mockResolvedValueOnce({ ok: true, result: { events: [] } });
    const response = await post({ action: "roll", requestId: REQUEST_ID, all: true });
    expect(response.status).toBe(200);
    expect(mocks.rollWinterBoard).toHaveBeenCalledWith(
      "u-winter",
      { requestId: REQUEST_ID, all: true },
      expect.any(Date),
    );
  });

  it("바퀴 보상과 교환 요청을 각각의 서비스로 넘긴다", async () => {
    mocks.claimWinterBoardMilestone.mockResolvedValueOnce({ ok: true });
    await post({ action: "claim_milestone", laps: 6 });
    expect(mocks.claimWinterBoardMilestone).toHaveBeenCalledWith("u-winter", 6, expect.any(Date));

    mocks.buyWinterBoardItem.mockResolvedValueOnce({
      ok: false,
      error: "not_enough_coins",
      status: 409,
    });
    const response = await post({ action: "buy", itemId: "emblem_box" });
    expect(response.status).toBe(409);
    expect(mocks.buyWinterBoardItem).toHaveBeenCalledWith("u-winter", "emblem_box", expect.any(Date));
  });

  it("형식이 틀린 요청은 400이다", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ action: "nope" })).status).toBe(400);
    expect((await post({ action: "claim_milestone", laps: "6" })).status).toBe(400);
    expect((await post({ action: "buy" })).status).toBe(400);
  });

  it("서비스가 던진 오류는 500으로 감싼다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.readWinterBoard.mockRejectedValueOnce(new Error("db down"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "server_error" });
  });
});
