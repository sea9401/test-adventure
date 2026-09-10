import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  readOverview: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/marketplaceSellOverview", () => ({
  readMarketplaceSellOverview: mocks.readOverview,
}));

import { GET } from "./route";

describe("GET /api/v2/marketplace/sell-overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("user-1");
    mocks.readOverview.mockResolvedValue({
      owned: [],
      equipped: {},
      materials: {},
      rareMaps: [],
      cashItems: {},
      cookingFoods: {},
      cookingFoodDefinitions: {},
      specimens: {},
    });
  });

  it("인증하지 않은 요청을 거부한다", async () => {
    mocks.ensureUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.readOverview).not.toHaveBeenCalled();
  });

  it("판매 화면 overview를 반환한다", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, owned: [] });
    expect(mocks.readOverview).toHaveBeenCalledWith("user-1");
  });
});
