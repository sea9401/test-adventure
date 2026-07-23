import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-smith"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildIdByUser: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/guildFacilities", () => ({
  readGuildSmithyLevel: vi.fn(),
}));
vi.mock("@/lib/server/guildWorkshopWeekly", () => ({
  currentGuildWorkshopWeek: vi.fn(() => ({
    key: "2026-W30",
    endsAt: new Date("2026-07-26T15:00:00.000Z"),
  })),
  lockGuildWorkshopWeeklyState: vi.fn(),
  readGuildWorkshopWeeklyState: vi.fn(),
  saveGuildWorkshopWeeklyState: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async () => ({ gold: 1_000_000 })),
  upsertGuildResources: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2GuildFame", () => ({
  addGuildFame: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));

import { readGuildSmithyLevel } from "@/lib/server/guildFacilities";
import {
  lockGuildWorkshopWeeklyState,
  readGuildWorkshopWeeklyState,
  saveGuildWorkshopWeeklyState,
} from "@/lib/server/guildWorkshopWeekly";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import {
  lockGuildResources,
  upsertGuildResources,
} from "@/lib/server/v2GuildResources";
import { GET, POST } from "./route";

function weeklyState(craftCount = 0) {
  return {
    weekKey: "2026-W30",
    craftCount,
    qualityCount: 0,
    weaponCount: 0,
    armorCount: 0,
    craftOnlyCount: 0,
    masterworkCount: 0,
    highTierCount: 0,
    claimed: [],
  };
}

function claimRequest(questId = "weekly_craft_20") {
  return new Request("http://localhost/api/v2/guild/workshop/weekly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readGuildSmithyLevel).mockResolvedValue(5);
  vi.mocked(readGuildWorkshopWeeklyState).mockResolvedValue(weeklyState(15));
  vi.mocked(lockGuildWorkshopWeeklyState).mockResolvedValue(weeklyState(15));
});

describe("길드 제작소 주간 의뢰", () => {
  it("제작소가 없으면 조회와 보상 수령을 거부한다", async () => {
    vi.mocked(readGuildSmithyLevel).mockResolvedValue(0);

    const getResponse = await GET();
    const postResponse = await POST(claimRequest());

    expect(getResponse.status).toBe(403);
    expect(await getResponse.json()).toEqual({
      ok: false,
      error: "smithy_required",
    });
    expect(postResponse.status).toBe(403);
    expect(await postResponse.json()).toEqual({
      ok: false,
      error: "smithy_required",
    });
    expect(readGuildWorkshopWeeklyState).not.toHaveBeenCalled();
    expect(lockGuildWorkshopWeeklyState).not.toHaveBeenCalled();
  });

  it("현재 제작소 레벨의 진척 보너스를 조회 결과에 적용한다", async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.progressBonusPct).toBe(40);
    expect(json.quests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "weekly_craft_20",
          rawProgress: 15,
          progress: 21,
          complete: true,
        }),
      ]),
    );
  });

  it("보너스로 목표를 달성한 의뢰도 한 번만 보상한다", async () => {
    const response = await POST(claimRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.progressBonusPct).toBe(40);
    expect(json.rewardGold).toBe(300_000);
    expect(json.rewardFame).toBe(100);
    expect(upsertGuildResources).toHaveBeenCalledWith(expect.anything(), 7, {
      gold: 1_300_000,
    });
    expect(addGuildFame).toHaveBeenCalledWith(expect.anything(), 7, 100);
    expect(saveGuildWorkshopWeeklyState).toHaveBeenCalledWith(
      expect.anything(),
      7,
      expect.objectContaining({ claimed: ["weekly_craft_20"] }),
    );
    expect(lockGuildResources).toHaveBeenCalledOnce();
  });
});
