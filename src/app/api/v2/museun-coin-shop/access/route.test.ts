import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u-review"),
  canAccess: vi.fn(async () => true),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/museunCoinShopAccess", () => ({
  canAccessMuseunCoinShop: mocks.canAccess,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureUser.mockResolvedValue("u-review");
  mocks.canAccess.mockResolvedValue(true);
});

describe("무슨 코인 상점 접근 확인 API", () => {
  it("허용 계정에만 메뉴 노출 신호를 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("일반 계정에는 존재를 숨긴다", async () => {
    mocks.canAccess.mockResolvedValue(false);

    expect((await GET()).status).toBe(404);
  });

  it("비로그인 요청에도 존재를 숨긴다", async () => {
    mocks.ensureUser.mockResolvedValue(null);

    expect((await GET()).status).toBe(404);
    expect(mocks.canAccess).not.toHaveBeenCalled();
  });
});
