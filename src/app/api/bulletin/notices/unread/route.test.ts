import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const recentLimit = vi.fn();
  const viewedWhere = vi.fn();
  const select = vi.fn();
  const ensureUser = vi.fn<() => Promise<string | null>>();
  return { recentLimit, viewedWhere, select, ensureUser };
});

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));

import { GET } from "./route";

describe("GET /api/bulletin/notices/unread", () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.recentLimit.mockReset();
    mocks.viewedWhere.mockReset();
    mocks.ensureUser.mockReset();
    mocks.ensureUser.mockResolvedValue("viewer");
    mocks.recentLimit.mockResolvedValue([]);
    mocks.viewedWhere.mockResolvedValue([]);
    mocks.select
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: mocks.recentLimit }),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({ where: mocks.viewedWhere }),
      }));
  });

  it("로그인하지 않은 요청을 거부한다", async () => {
    mocks.ensureUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("미열람 공지가 없으면 false를 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasUnread: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("조회 기록이 없는 공지가 있으면 true를 반환한다", async () => {
    mocks.recentLimit.mockResolvedValue([{ id: 17 }]);

    const response = await GET();

    expect(await response.json()).toEqual({ hasUnread: true });
    expect(mocks.recentLimit).toHaveBeenCalledWith(1);
  });

  it("최신 공지를 조회했으면 이전 공지의 미열람 여부와 무관하게 false를 반환한다", async () => {
    mocks.recentLimit.mockResolvedValue([{ id: 17 }]);
    mocks.viewedWhere.mockResolvedValue([{ postId: 17 }]);

    const response = await GET();

    expect(await response.json()).toEqual({ hasUnread: false });
  });
});
