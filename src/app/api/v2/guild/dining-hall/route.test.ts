import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuildDiningMenuId } from "@/adventure/data/v2/guildDining";
import { emptyFarmState } from "@/adventure/v2/farm";
import { kstWeekMondayKey } from "@/lib/kst";

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => [{ buildings: {} }]),
    })),
  })),
};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-diner"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/settlementBuildingAccess", () => ({
  buildingLevelFromSlots: vi.fn(() => 3),
}));
vi.mock("@/lib/server/guildAdmin", () => ({
  isGuildAdmin: vi.fn(async () => true),
}));
vi.mock("@/lib/server/guildDining", () => ({
  lockGuildDiningWeekly: vi.fn(),
  updateGuildDiningWeekly: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  readSave: vi.fn(async (_tx, _userId, key, fallback) =>
    key === "inventory.v2" ? { hpCharges: 10_000, mpCharges: 20_000 } : fallback,
  ),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/adventurerAssociation", () => ({
  claimWeeklyFacilitySource: vi.fn(async () => ({ ok: true })),
}));

import { lockGuildDiningWeekly } from "@/lib/server/guildDining";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/guild/dining-hall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function weekly(
  pantryPoints = 0,
  selectedMenuIds: GuildDiningMenuId[] = ["hearty_stew"],
) {
  return {
    guildId: 7,
    weekKey: kstWeekMondayKey(),
    selectedMenuIds,
    pantryPoints,
    targetPoints: 60,
    eligibleUserIds: ["u-diner"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockGuildDiningWeekly).mockResolvedValue(weekly());
  vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
    if (key === "farm.v2") {
      return { ...emptyFarmState(), inventory: { wheat: 30 } };
    }
    if (key === "fishing-stock.v1") {
      return { version: 1, items: { catch_common: 12 } };
    }
    if (key === "inventory.v2") {
      return { hpCharges: 10_000, mpCharges: 20_000 };
    }
    return {
      weekKey: kstWeekMondayKey(),
      guildId: 7,
      contributionPoints: 15,
      mealsUsed: 0,
    };
  });
});

describe("길드 식당", () => {
  it("등록된 농장 식재료를 소비해 공동 준비와 개인 식권 진척을 함께 올린다", async () => {
    const response = await POST(
      request({ action: "donate", ingredientId: "farm:wheat", quantity: 10 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.donated).toEqual({
      ingredientName: "밀",
      quantity: 10,
      points: 10,
      contributionPoints: 100,
    });
    expect(json.pantry.points).toBe(10);
    expect(json.contributionPoints).toBe(25);
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-diner",
      "farm.v2",
      expect.objectContaining({ inventory: { wheat: 20 } }),
    );
  });

  it("일반 어획물은 5개 단위로 공동 식재료에 기부한다", async () => {
    const response = await POST(
      request({
        action: "donate",
        ingredientId: "fishing_item:catch_common",
        quantity: 10,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.donated).toEqual({
      ingredientName: "일반 어획물",
      quantity: 10,
      points: 2,
      contributionPoints: 20,
    });
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-diner",
      "fishing-stock.v1",
      { version: 1, items: { catch_common: 2 } },
    );
  });

  it("어획물 묶음 단위에 맞지 않는 기부를 거부한다", async () => {
    const response = await POST(
      request({
        action: "donate",
        ingredientId: "fishing_item:catch_common",
        quantity: 6,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_donation");
  });

  it("공동 준비가 끝나고 식권이 있으면 회복식을 주문한다", async () => {
    vi.mocked(lockGuildDiningWeekly).mockResolvedValue(weekly(60));
    const response = await POST(request({ action: "order", menuId: "hearty_stew" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ordered).toMatchObject({
      menuId: "hearty_stew",
      recovery: { hp: 250_000, mp: 250_000 },
    });
    expect(json.tickets).toMatchObject({
      base: 1,
      contributionEarned: 1,
      earned: 2,
      used: 1,
      available: 1,
    });
    expect(json.charges).toMatchObject({ hp: 260_000, mp: 270_000 });
    expect(logGuildActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "dining_meal", actorUserId: "u-diner" }),
    );
  });

  it("기부하지 않은 주간 참여 길드원도 기본 식권으로 한 번 식사한다", async () => {
    vi.mocked(lockGuildDiningWeekly).mockResolvedValue(weekly(60));
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === "inventory.v2") {
        return { hpCharges: 10_000, mpCharges: 20_000 };
      }
      return {
        weekKey: kstWeekMondayKey(),
        guildId: 7,
        contributionPoints: 0,
        mealsUsed: 0,
      };
    });

    const response = await POST(
      request({ action: "order", menuId: "hearty_stew" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tickets).toMatchObject({ earned: 1, used: 1, available: 0 });
  });

  it("같은 효과식을 다시 주문하면 기존 만료 시각에 12시간을 더한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
    const currentExpiresAt = Date.now() + 60 * 60 * 1000;
    vi.mocked(lockGuildDiningWeekly).mockResolvedValue(
      weekly(60, ["adventurer_meal" as const]),
    );
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === "inventory.v2") {
        return { hpCharges: 10_000, mpCharges: 20_000 };
      }
      return {
        weekKey: kstWeekMondayKey(),
        guildId: 7,
        contributionPoints: 30,
        mealsUsed: 0,
        activeEffect: {
          menuId: "adventurer_meal",
          kind: "hunt_exp",
          bonusPct: 8,
          expiresAt: currentExpiresAt,
          roundingRemainder: 0,
        },
      };
    });

    try {
      const response = await POST(
        request({ action: "order", menuId: "adventurer_meal" }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.activeEffect).toMatchObject({
        menuId: "adventurer_meal",
        expiresAt: currentExpiresAt + 12 * 60 * 60 * 1000,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("즉시 회복식은 적용 중인 경험치 효과를 제거하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
    const currentExpiresAt = Date.now() + 60 * 60 * 1000;
    vi.mocked(lockGuildDiningWeekly).mockResolvedValue(weekly(60));
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === "inventory.v2") {
        return { hpCharges: 10_000, mpCharges: 20_000 };
      }
      return {
        weekKey: kstWeekMondayKey(),
        guildId: 7,
        contributionPoints: 30,
        mealsUsed: 0,
        activeEffect: {
          menuId: "adventurer_meal",
          kind: "hunt_exp",
          bonusPct: 8,
          expiresAt: currentExpiresAt,
          roundingRemainder: 0,
        },
      };
    });

    try {
      const response = await POST(
        request({ action: "order", menuId: "hearty_stew" }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.activeEffect).toMatchObject({
        menuId: "adventurer_meal",
        expiresAt: currentExpiresAt,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("기부가 시작된 뒤에는 관리자의 메뉴 변경도 거부한다", async () => {
    vi.mocked(lockGuildDiningWeekly).mockResolvedValue(weekly(1));
    const response = await POST(
      request({ action: "select_menus", menuIds: ["adventurer_meal"] }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("menu_locked");
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
