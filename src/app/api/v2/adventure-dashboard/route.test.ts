import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "dashboard-user" as string | null,
  saves: {} as Record<string, unknown>,
  upsertSave: vi.fn(async () => undefined),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSaves: vi.fn(async (_db, _userId, fallbacks: Record<string, unknown>) => ({
    ...fallbacks,
    ...mocks.saves,
  })),
  upsertSave: mocks.upsertSave,
}));

import { GET } from "./route";
import { PATCH } from "./preferences/route";
import { ADVENTURE_HOME_SAVE_KEY } from "@/lib/server/adventureDashboard";

describe("모험 대시보드 API", () => {
  beforeEach(() => {
    mocks.userId = "dashboard-user";
    mocks.saves = {};
    mocks.upsertSave.mockClear();
  });

  it("비로그인 사용자를 거부한다", async () => {
    mocks.userId = null;
    expect((await GET()).status).toBe(401);
  });

  it("저장된 비활성 활동을 요약과 알림에서 제외한다", async () => {
    const now = Date.now();
    mocks.saves = {
      [ADVENTURE_HOME_SAVE_KEY]: {
        activityEnabled: { farm_ready: false },
      },
      "farm.v2": {
        plots: [{ id: "plot-1", cropId: "wheat", plantedAt: now - 1, readyAt: now - 1 }],
      },
    };

    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.activities.find((item: { id: string }) => item.id === "farm_ready")).toMatchObject({
      enabled: false,
      state: "actionable",
    });
    expect(json.notifications.tabs.life).toBeUndefined();
  });

  it("폭풍 원정 해금 전에는 원정 확인 레드닷을 노출하지 않는다", async () => {
    mocks.saves = {
      "character.v2": { frontierDepth: 71 },
    };

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(
      json.activities.find(
        (item: { id: string }) => item.id === "storm_expedition_daily",
      ),
    ).toMatchObject({ state: "unavailable" });
    expect(json.notifications.tabs.battle).toBeUndefined();
    expect(
      json.notifications.paths["/battle/storm-expedition"],
    ).toBeUndefined();
  });

  it("환경설정 PATCH에서 알 수 없는 위젯과 활동을 제거한다", async () => {
    const response = await PATCH(new Request("http://game.test/api/v2/adventure-dashboard/preferences", {
      method: "PATCH",
      body: JSON.stringify({
        widgetOrder: ["ranking_preview", "wrong"],
        hiddenWidgetIds: ["wrong"],
        activityEnabled: { farm_ready: false, wrong: true },
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "dashboard-user",
      ADVENTURE_HOME_SAVE_KEY,
      expect.objectContaining({
        hiddenWidgetIds: ["stamina"],
        activityEnabled: { farm_ready: false },
      }),
    );
  });
});
