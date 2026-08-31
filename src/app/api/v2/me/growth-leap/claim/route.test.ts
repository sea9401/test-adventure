import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GROWTH_LEAP_SAVE_KEY,
  activateGrowthLeap,
  recordGrowthLeapStamina,
} from "@/adventure/data/v2/growthLeap";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-growth"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
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
}));

import { POST } from "./route";

function request(milestoneId: string) {
  return new Request("http://localhost/api/v2/me/growth-leap/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ milestoneId }),
  });
}

function missionWithProgress(stamina: number) {
  const activated = activateGrowthLeap({}, Date.now() - 1_000);
  if (!activated.ok) throw new Error("expected activation");
  return recordGrowthLeapStamina(activated.state, stamina, Date.now());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T03:00:00Z"));
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("character.v2", { cashItems: {} });
  mocks.saves.set("inventory.v2", { masteryCertificates: 50 });
  mocks.saves.set(STAMINA_POTIONS_KEY, { count: 2, boundCount: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("성장 도약 단계 보상 수령", () => {
  it("1단계 보상을 숙련 증서와 귀속 회복약으로 원자 지급한다", async () => {
    mocks.saves.set(GROWTH_LEAP_SAVE_KEY, missionWithProgress(3_000));

    const response = await POST(request("growth_1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      milestoneId: "growth_1",
      reward: {
        masteryCertificates: 300,
        staminaPotions: 5,
        cosmeticExtensions: 0,
      },
      certificates: 350,
      staminaPotions: { count: 7, boundCount: 6 },
    });
    expect(mocks.saves.get("inventory.v2")).toEqual({
      masteryCertificates: 350,
    });
    expect(mocks.saves.get(STAMINA_POTIONS_KEY)).toEqual({
      count: 7,
      boundCount: 6,
    });
    expect(mocks.saves.get(GROWTH_LEAP_SAVE_KEY)).toMatchObject({
      mission: { claimedMilestoneIds: ["growth_1"] },
    });
  });

  it("이미 받은 단계는 중복 지급하지 않는다", async () => {
    mocks.saves.set(GROWTH_LEAP_SAVE_KEY, missionWithProgress(3_000));
    expect((await POST(request("growth_1"))).status).toBe(200);
    const inventoryAfterFirst = mocks.saves.get("inventory.v2");

    const duplicate = await POST(request("growth_1"));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: "already_claimed" });
    expect(mocks.saves.get("inventory.v2")).toEqual(inventoryAfterFirst);
  });

  it("5단계는 꾸미기 30일 연장권을 거래 가능한 기존 아이템으로 지급한다", async () => {
    mocks.saves.set(GROWTH_LEAP_SAVE_KEY, missionWithProgress(50_000));

    const response = await POST(request("growth_5"));

    expect(response.status).toBe(200);
    expect(mocks.saves.get("character.v2")).toMatchObject({
      cashItems: { cosmetic_extension_30d: 1 },
    });
    expect(mocks.saves.get("inventory.v2")).toEqual({
      masteryCertificates: 1_750,
    });
  });

  it("미달성 단계와 수령 기간이 지난 단계는 지급하지 않는다", async () => {
    mocks.saves.set(GROWTH_LEAP_SAVE_KEY, missionWithProgress(9_999));
    const incomplete = await POST(request("growth_2"));
    expect(incomplete.status).toBe(409);
    expect(await incomplete.json()).toMatchObject({ error: "not_complete" });

    const expiredPurchase = activateGrowthLeap(
      {},
      Date.now() - 38 * 86_400_000,
    );
    if (!expiredPurchase.ok) throw new Error("expected activation");
    const expired = recordGrowthLeapStamina(
      expiredPurchase.state,
      50_000,
      expiredPurchase.state.mission!.purchasedAt + 1,
    );
    mocks.saves.set(GROWTH_LEAP_SAVE_KEY, expired);
    const afterExpiry = await POST(request("growth_5"));
    expect(afterExpiry.status).toBe(410);
    expect(await afterExpiry.json()).toMatchObject({ error: "expired" });
  });
});
