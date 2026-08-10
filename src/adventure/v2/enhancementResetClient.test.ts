import { describe, expect, it } from "vitest";
import { resetEnhancementAndRefresh } from "./enhancementResetClient";

describe("resetEnhancementAndRefresh", () => {
  it("초기화 성공 후 장비 목록과 전역 게임 상태를 모두 새로고침한다", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let equipmentRefreshes = 0;
    let gameStateRefreshes = 0;

    const result = await resetEnhancementAndRefresh({
      iid: "w1",
      request: async (url, init) => {
        requests.push({ url, init });
        return Response.json({ ok: true, iid: "w1" });
      },
      refreshEquipment: async () => {
        equipmentRefreshes += 1;
      },
      refreshGameState: async () => {
        gameStateRefreshes += 1;
      },
    });

    expect(result).toEqual({ ok: true, iid: "w1" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "/api/v2/me/enhance/reset",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iid: "w1" }),
      },
    });
    expect(equipmentRefreshes).toBe(1);
    expect(gameStateRefreshes).toBe(1);
  });

  it("서버가 거부하면 상태를 새로고침하지 않는다", async () => {
    let refreshes = 0;

    const result = await resetEnhancementAndRefresh({
      iid: "locked",
      request: async () =>
        Response.json({ ok: false, error: "locked" }, { status: 409 }),
      refreshEquipment: async () => {
        refreshes += 1;
      },
      refreshGameState: async () => {
        refreshes += 1;
      },
    });

    expect(result).toEqual({ ok: false, error: "locked" });
    expect(refreshes).toBe(0);
  });
});
