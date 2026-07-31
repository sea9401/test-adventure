import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-attendance"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  readSave: vi.fn(
    async (_db: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  ),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
  recordRewardFailureSoon: mocks.recordRewardFailureSoon,
}));

import { POST } from "./route";

const JULY_20 = new Date("2026-07-20T03:00:00Z");
const DAY_MS = 86_400_000;

function julyDayKeys(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JULY_20);
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("character.v2", {
    class: "warrior",
    gold: 1_000,
    stamina: { current: 500, lastUpdatedAt: JULY_20.getTime() },
  });
});

describe("월간 출석 보상 수령", () => {
  it("1일차에는 지원권 15일을 계정에 직접 적용한다", async () => {
    const response = await POST();
    const json = (await response.json()) as {
      ok: boolean;
      claimedCount: number;
      reward: { kind: string; days: number };
      adventureSupportActiveUntil: number;
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.claimedCount).toBe(1);
    expect(json.reward).toEqual({ kind: "adventure_support", days: 15 });
    expect(json.adventureSupportActiveUntil).toBe(
      JULY_20.getTime() + 15 * DAY_MS,
    );
    expect(mocks.saves.get("monthly-attendance.v1")).toEqual({
      monthKey: "2026-07",
      claimedDayKeys: ["2026-07-20"],
    });

    const character = mocks.saves.get("character.v2") as {
      adventureSupport: { activeUntil: number };
      stamina: { current: number };
    };
    expect(character.adventureSupport.activeUntil).toBe(
      json.adventureSupportActiveUntil,
    );
    expect(character.stamina.current).toBe(1_500);
  });

  it("같은 KST 날짜의 중복 수령은 재화를 더 지급하지 않는다", async () => {
    expect((await POST()).status).toBe(200);
    const characterAfterFirst = mocks.saves.get("character.v2");

    const duplicate = await POST();

    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toBe("already_claimed");
    expect(mocks.saves.get("character.v2")).toEqual(characterAfterFirst);
  });

  it("다음 날에는 다음 칸의 푸른 강화석을 지급한다", async () => {
    expect((await POST()).status).toBe(200);
    vi.setSystemTime(new Date(JULY_20.getTime() + DAY_MS));

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; color: string; count: number };
      claimedCount: number;
      grantedMaterials: Record<string, number>;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({
      kind: "enhancement_stone",
      color: "blue",
      count: 1,
    });
    expect(json.claimedCount).toBe(2);
    expect(json.grantedMaterials).toEqual({ v2_blue_enhance_stone: 1 });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 1_000,
      materials: { v2_blue_enhance_stone: 1 },
    });
  });

  it("3일차에는 스태미나 회복약 2개를 기존 보유량에 더한다", async () => {
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(2),
    });
    mocks.saves.set("stamina-potions.v1", { count: 5 });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; count: number };
      staminaPotions: number;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({ kind: "stamina_potion", count: 2 });
    expect(json.staminaPotions).toBe(7);
    expect(mocks.saves.get("stamina-potions.v1")).toEqual({ count: 7 });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "stamina_potion",
        quantity: 2,
      }),
    );
  });

  it("7일차에는 기존 보상과 닉네임 꾸미기 상자를 함께 지급한다", async () => {
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(6),
    });
    mocks.saves.set("stamina-potions.v1", { count: 4 });
    mocks.saves.set("character.v2", {
      class: "warrior",
      cashItems: { chroma_name_box: 1 },
    });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; count: number; cosmeticBox: string };
      staminaPotions: number;
      grantedCosmeticBox: string;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({
      kind: "stamina_potion",
      count: 2,
      cosmeticBox: "chroma_name_box",
    });
    expect(json.staminaPotions).toBe(6);
    expect(json.grantedCosmeticBox).toBe("chroma_name_box");
    expect(mocks.saves.get("character.v2")).toMatchObject({
      cashItems: { chroma_name_box: 2 },
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "chroma_name_box",
        quantity: 1,
      }),
    );
  });

  it("14일차에는 보스 소환서와 채팅 배지 상자를 함께 지급한다", async () => {
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(13),
    });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; count: number };
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({
      kind: "boss_summon_scroll",
      count: 3,
      cosmeticBox: "chat_badge_box",
    });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      materials: { v2_boss_summon_scroll: 3 },
      cashItems: { chat_badge_box: 1 },
    });
  });

  it("21일차에는 숙련의 증표를 전용 인벤토리에 누적한다", async () => {
    vi.setSystemTime(new Date("2026-07-25T03:00:00Z"));
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(20),
    });
    mocks.saves.set("inventory.v2", { masteryCertificates: 50 });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; count: number };
      masteryCertificates: number;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({ kind: "mastery_certificate", count: 300 });
    expect(json.masteryCertificates).toBe(350);
    expect(mocks.saves.get("inventory.v2")).toEqual({
      masteryCertificates: 350,
    });
  });

  it("28일차에는 강화석 묶음과 프로필 꾸미기 상자를 함께 지급한다", async () => {
    vi.setSystemTime(new Date("2026-07-28T03:00:00Z"));
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(27),
    });
    mocks.saves.set("character.v2", {
      class: "warrior",
      materials: {
        v2_red_enhance_stone: 5,
        v2_blue_enhance_stone: 7,
      },
    });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; red: number; blue: number };
      complete: boolean;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({
      kind: "enhancement_stone_bundle",
      red: 2,
      blue: 2,
      cosmeticBox: "profile_border_box",
    });
    expect(json.complete).toBe(true);
    expect(mocks.saves.get("character.v2")).toMatchObject({
      materials: {
        v2_red_enhance_stone: 7,
        v2_blue_enhance_stone: 9,
      },
      cashItems: { profile_border_box: 1 },
    });
  });
});
