import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn<() => Promise<string | null>>(),
  rows: [] as Array<{ payload: unknown }>,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.rows),
        })),
      })),
    })),
  },
}));

import { GET } from "./route";

const replayId = "01987654-3210-4abc-8def-0123456789ab";
const ctx = { params: Promise.resolve({ replayId }) };

describe("GET battle replay", () => {
  beforeEach(() => {
    mocks.ensureUser.mockReset();
    mocks.ensureUser.mockResolvedValue("viewer");
    mocks.rows = [];
  });

  it("소유자의 전체 로그를 단건 반환하고 캐시하지 않는다", async () => {
    const replay = {
      enemy: { name: "산군", hp: 30_000 },
      playerMaxHp: 500,
      playerMaxMp: 100,
      log: [
        { kind: "turn_marker", text: "1턴" },
        { kind: "info", text: "전투 시작" },
      ],
    };
    mocks.rows = [{ payload: replay }];

    const response = await GET(new Request("http://test"), ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ ok: true, replay });
  });

  it("만료·타인 기록처럼 조회 결과가 없으면 404로 숨긴다", async () => {
    const response = await GET(new Request("http://test"), ctx);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "no_replay" });
  });

  it("로그인하지 않은 요청은 거절한다", async () => {
    mocks.ensureUser.mockResolvedValue(null);
    const response = await GET(new Request("http://test"), ctx);
    expect(response.status).toBe(401);
  });
});
