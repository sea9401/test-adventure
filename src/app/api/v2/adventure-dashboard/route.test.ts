import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "dashboard-user" as string | null,
  saves: {} as Record<string, unknown>,
  upsertSave: vi.fn(async () => undefined),
  facilities: { scope: "association", trainingGroundLevel: 1 } as
    | { scope: "association"; trainingGroundLevel: number }
    | { scope: "guild"; trainingGroundLevel: number; smithyLevel: number },
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

vi.mock("@/lib/server/adventureDashboardFacilities", () => ({
  readAdventureFacilityContext: vi.fn(async () => mocks.facilities),
}));

import { GET } from "./route";
import { PATCH } from "./preferences/route";
import { ADVENTURE_HOME_SAVE_KEY } from "@/lib/server/adventureDashboard";

describe("모험 대시보드 API", () => {
  beforeEach(() => {
    mocks.userId = "dashboard-user";
    mocks.saves = {};
    mocks.facilities = { scope: "association", trainingGroundLevel: 1 };
    mocks.upsertSave.mockClear();
  });

  it("길드원에게는 길드 시설 기준으로 훈련장과 제작소 납품을 보여 준다", async () => {
    mocks.saves = { "character.v2": { class: "warrior", level: 50 } };
    const solo = (await (await GET()).json()).activities as { id: string; tab: string; state: string }[];
    expect(solo.find((item) => item.id === "guild_training_daily")).toMatchObject({ tab: "town", state: "actionable" });
    expect(solo.find((item) => item.id === "guild_workshop_delivery_daily")).toMatchObject({ state: "unavailable" });

    mocks.facilities = { scope: "guild", trainingGroundLevel: 2, smithyLevel: 1 };
    const json = await (await GET()).json();
    const member = json.activities as { id: string; tab: string; state: string }[];
    expect(member.find((item) => item.id === "guild_training_daily")).toMatchObject({ tab: "guild", state: "actionable" });
    expect(member.find((item) => item.id === "guild_workshop_delivery_daily")).toMatchObject({ tab: "guild", state: "in_progress" });
    expect(json.notifications.tabs.guild).toBe(true);
    expect(json.notifications.paths["/guild?tab=facilities&facility=training_ground"]).toBe(true);
  });

  it("비로그인 사용자를 거부한다", async () => {
    mocks.userId = null;
    expect((await GET()).status).toBe(401);
  });

  it("생활 명성을 함께 돌려준다", async () => {
    expect((await (await GET()).json()).lifeRenown).toBe(0);
    mocks.saves = {
      "life-major.v1": { major: "mining", masteryXp: { mining: 480_200 + 48_020 * 20 } },
    };
    expect((await (await GET()).json()).lifeRenown).toBe(30);
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
