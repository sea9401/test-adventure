import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  rows: [
    {
      userId: "user-1",
      email: "player@example.com",
      gameName: "모험가",
      className: "전사",
      title: "초심자",
      lastSeenAt: new Date("2026-07-24T00:00:00.000Z"),
    },
  ],
  select: vi.fn(),
}));

vi.mock("@/lib/server/isAdmin", () => ({ requireAdmin: mocks.gate }));
vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

import { GET, ONLINE_WINDOW_SECONDS } from "./route";

describe("GET /api/admin/presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => mocks.rows),
          })),
        })),
      })),
    });
  });

  it("관리자에게 최근 접속자 명단을 ISO 시각과 함께 반환한다", async () => {
    const response = await GET();
    const json = (await response.json()) as {
      onlineWindowSeconds: number;
      users: Array<{ userId: string; lastSeenAt: string }>;
    };

    expect(response.status).toBe(200);
    expect(json.onlineWindowSeconds).toBe(ONLINE_WINDOW_SECONDS);
    expect(json.users).toEqual([
      expect.objectContaining({
        userId: "user-1",
        lastSeenAt: "2026-07-24T00:00:00.000Z",
      }),
    ]);
  });

  it("관리자 권한이 없으면 DB를 조회하지 않는다", async () => {
    mocks.gate.mockResolvedValue(new Response("forbidden", { status: 403 }));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
