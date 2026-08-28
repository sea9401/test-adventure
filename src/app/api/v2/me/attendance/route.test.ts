import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  hasCompletedOnboarding: vi.fn(),
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
vi.mock("@/lib/server/profile", () => ({
  hasCompletedOnboarding: mocks.hasCompletedOnboarding,
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

import { GET, POST } from "./route";

const JULY_20 = new Date("2026-07-20T03:00:00Z");
const DAY_MS = 86_400_000;

function julyDayKeys(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`,
  );
}

function septemberDayKeys(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(JULY_20);
  vi.clearAllMocks();
  mocks.hasCompletedOnboarding.mockResolvedValue(true);
  mocks.saves.clear();
  mocks.saves.set("character.v2", {
    gold: 1_000,
    stamina: { current: 500, lastUpdatedAt: JULY_20.getTime() },
  });
});

describe("월간 출석 보상 수령", () => {
  it("2026년 9월에는 확정된 전용 보상표를 안내한다", async () => {
    vi.setSystemTime(new Date("2026-09-01T03:00:00Z"));

    const response = await GET();
    const json = (await response.json()) as {
      monthKey: string;
      rewards: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(json.monthKey).toBe("2026-09");
    expect(json.rewards).toHaveLength(28);
    expect(
      [1, 7, 8, 11, 14, 17, 19, 21, 24, 28].map(
        (day) => json.rewards[day - 1],
      ),
    ).toEqual([
      { kind: "adventure_support", days: 7 },
      { kind: "stamina_potion", count: 2 },
      { kind: "boss_summon_scroll", count: 10 },
      { kind: "torn_map_fragment", count: 5 },
      { kind: "stamina_potion", count: 3 },
      { kind: "boss_summon_scroll", count: 15 },
      { kind: "torn_map_fragment", count: 10 },
      { kind: "mastery_certificate", count: 500 },
      { kind: "boss_summon_scroll", count: 20 },
      { kind: "mastery_certificate", count: 1_500 },
    ]);
  });

  it("직업 없는 신규 모험가도 1일차 지원권 15일을 계정에 직접 적용한다", async () => {
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

  it("온보딩을 마치지 않은 계정은 출석 보상을 받을 수 없다", async () => {
    mocks.hasCompletedOnboarding.mockResolvedValueOnce(false);

    const response = await POST();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "no_character" });
    expect(mocks.saves.has("monthly-attendance.v1")).toBe(false);
  });

  it("같은 KST 날짜의 중복 수령은 재화를 더 지급하지 않는다", async () => {
    expect((await POST()).status).toBe(200);
    const characterAfterFirst = mocks.saves.get("character.v2");

    const duplicate = await POST();

    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toBe("already_claimed");
    expect(mocks.saves.get("character.v2")).toEqual(characterAfterFirst);
  });

  it("다음 날에는 다음 칸의 찢어진 지도 조각을 기존 재료에 누적한다", async () => {
    mocks.saves.set("character.v2", {
      gold: 1_000,
      stamina: { current: 500, lastUpdatedAt: JULY_20.getTime() },
      materials: { v2_torn_map_fragment: 3 },
    });
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
      kind: "torn_map_fragment",
      count: 2,
    });
    expect(json.claimedCount).toBe(2);
    expect(json.grantedMaterials).toEqual({ v2_torn_map_fragment: 2 });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 1_000,
      materials: { v2_torn_map_fragment: 5 },
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith({
      userId: "u-attendance",
      eventType: "reward.monthly_attendance",
      itemKind: "material",
      itemId: "v2_torn_map_fragment",
      quantity: 2,
    });
  });

  it("6일차에는 협동 주화를 기존 재료에 누적한다", async () => {
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(5),
    });
    mocks.saves.set("character.v2", {
      class: "warrior",
      materials: { v2_coop_coin: 7 },
    });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; count: number };
      grantedMaterials: Record<string, number>;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({ kind: "coop_coin", count: 20 });
    expect(json.grantedMaterials).toEqual({ v2_coop_coin: 20 });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      materials: { v2_coop_coin: 27 },
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith({
      userId: "u-attendance",
      eventType: "reward.monthly_attendance",
      itemKind: "material",
      itemId: "v2_coop_coin",
      quantity: 20,
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
    expect(mocks.saves.get("stamina-potions.v1")).toEqual({
      count: 7,
      boundCount: 0,
    });
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

  it("14일차에는 지원권 7일과 채팅 배지 상자를 함께 지급한다", async () => {
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(13),
    });
    const previousActiveUntil = JULY_20.getTime() + 10 * DAY_MS;
    mocks.saves.set("character.v2", {
      class: "warrior",
      adventureSupport: { activeUntil: previousActiveUntil },
      stamina: { current: 500, lastUpdatedAt: JULY_20.getTime() },
    });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; days: number; cosmeticBox: string };
      adventureSupportActiveUntil: number;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({
      kind: "adventure_support",
      days: 7,
      cosmeticBox: "chat_badge_box",
    });
    expect(json.adventureSupportActiveUntil).toBe(
      previousActiveUntil + 7 * DAY_MS,
    );
    expect(mocks.saves.get("character.v2")).toMatchObject({
      adventureSupport: { activeUntil: previousActiveUntil + 7 * DAY_MS },
      stamina: { current: 500 },
      cashItems: { chat_badge_box: 1 },
    });
  });

  it("21일차에는 숙련의 증표와 지원권 7일을 함께 지급한다", async () => {
    vi.setSystemTime(new Date("2026-07-25T03:00:00Z"));
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(20),
    });
    const previousActiveUntil = JULY_20.getTime() + 10 * DAY_MS;
    mocks.saves.set("character.v2", {
      class: "warrior",
      adventureSupport: { activeUntil: previousActiveUntil },
      stamina: { current: 500, lastUpdatedAt: JULY_20.getTime() },
    });
    mocks.saves.set("inventory.v2", { masteryCertificates: 50 });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; count: number; adventureSupportDays: number };
      masteryCertificates: number;
      adventureSupportActiveUntil: number;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({
      kind: "mastery_certificate",
      count: 300,
      adventureSupportDays: 7,
    });
    expect(json.masteryCertificates).toBe(350);
    expect(json.adventureSupportActiveUntil).toBe(
      previousActiveUntil + 7 * DAY_MS,
    );
    expect(mocks.saves.get("inventory.v2")).toEqual({
      masteryCertificates: 350,
    });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      adventureSupport: { activeUntil: previousActiveUntil + 7 * DAY_MS },
      stamina: { current: 500 },
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "monthly_adventure_support",
        quantity: 7,
      }),
    );
  });

  it("28일차에는 숙련의 증표 500개와 프로필 꾸미기 상자를 함께 지급한다", async () => {
    vi.setSystemTime(new Date("2026-07-28T03:00:00Z"));
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-07",
      claimedDayKeys: julyDayKeys(27),
    });
    mocks.saves.set("character.v2", { class: "warrior" });
    mocks.saves.set("inventory.v2", { masteryCertificates: 50 });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; count: number; cosmeticBox: string };
      masteryCertificates: number;
      complete: boolean;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({
      kind: "mastery_certificate",
      count: 500,
      cosmeticBox: "profile_border_box",
    });
    expect(json.masteryCertificates).toBe(550);
    expect(json.complete).toBe(true);
    expect(mocks.saves.get("inventory.v2")).toEqual({
      masteryCertificates: 550,
    });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      cashItems: { profile_border_box: 1 },
    });
  });

  it("2026년 9월 28일차에는 꾸미기 상자 없이 숙련의 증표 1,500개를 지급한다", async () => {
    vi.setSystemTime(new Date("2026-09-28T03:00:00Z"));
    mocks.saves.set("monthly-attendance.v1", {
      monthKey: "2026-09",
      claimedDayKeys: septemberDayKeys(27),
    });
    mocks.saves.set("character.v2", { class: "warrior" });
    mocks.saves.set("inventory.v2", { masteryCertificates: 50 });

    const response = await POST();
    const json = (await response.json()) as {
      reward: { kind: string; count: number; cosmeticBox?: string };
      masteryCertificates: number;
      grantedCosmeticBox: string | null;
      complete: boolean;
    };

    expect(response.status).toBe(200);
    expect(json.reward).toEqual({
      kind: "mastery_certificate",
      count: 1_500,
    });
    expect(json.masteryCertificates).toBe(1_550);
    expect(json.grantedCosmeticBox).toBeNull();
    expect(json.complete).toBe(true);
    expect(mocks.saves.get("inventory.v2")).toEqual({
      masteryCertificates: 1_550,
    });
    expect(mocks.saves.get("character.v2")).toEqual({ class: "warrior" });
  });
});
