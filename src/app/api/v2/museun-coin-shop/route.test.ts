import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUSEUN_COIN_WALLET_KEY } from "@/adventure/data/v2/museunCashItems";
import { GROWTH_LEAP_SAVE_KEY } from "@/adventure/data/v2/growthLeap";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";
import {
  PROFILE_BADGE_STAND_ITEM_ID,
  PROFILE_BADGE_STAND_PRICE,
} from "@/adventure/profile/profileShowcase";

const coinMocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  spend: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-buyer"),
}));
vi.mock("@/lib/server/museunCoinShopAccess", () => ({
  canAccessMuseunCoinShop: vi.fn(async () => true),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/museunCoinAccount", () => ({
  getMuseunCoinBalance: coinMocks.getBalance,
  spendMuseunCoins: coinMocks.spend,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  readSave: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
}));

import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { canAccessMuseunCoinShop } from "@/lib/server/museunCoinShopAccess";
import { GET, POST } from "./route";

const saves = new Map<string, unknown>();

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/museun-coin-shop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T12:00:00+09:00"));
  vi.stubEnv("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN", "true");
  vi.clearAllMocks();
  saves.clear();
  saves.set(MUSEUN_COIN_WALLET_KEY, { coins: 3_000 });
  saves.set("character.v2", { cashItems: { chroma_name_box: 2 } });
  saves.set(GROWTH_LEAP_SAVE_KEY, {});
  saves.set(STAMINA_POTIONS_KEY, { count: 0, boundCount: 0 });
  coinMocks.getBalance.mockImplementation(async () => {
    const raw = saves.get(MUSEUN_COIN_WALLET_KEY) as { coins?: number };
    const coins = raw?.coins ?? 0;
    return { coins, freeCoins: coins, paidCoins: 0 };
  });
  coinMocks.spend.mockImplementation(async (_tx, input: { coins: number }) => {
    const raw = saves.get(MUSEUN_COIN_WALLET_KEY) as { coins?: number };
    const coins = raw?.coins ?? 0;
    if (coins < input.coins) {
      return {
        ok: false as const,
        error: "insufficient_coins" as const,
        coins,
        spendableCoins: coins,
        requiredCoins: input.coins,
      };
    }
    const next = coins - input.coins;
    saves.set(MUSEUN_COIN_WALLET_KEY, { coins: next });
    return {
      ok: true as const,
      coins: next,
      freeCoins: next,
      paidCoins: 0,
      ledgerId: 1,
      duplicate: false as const,
    };
  });
  vi.mocked(readSave).mockImplementation(
    async (_db, _userId, key, fallback) => saves.get(key) ?? fallback,
  );
  vi.mocked(lockSaveForUpdate).mockImplementation(
    async (_tx, _userId, key, fallback) => saves.get(key) ?? fallback,
  );
  vi.mocked(upsertSave).mockImplementation(
    async (_tx, _userId, key, value) => {
      saves.set(key, value);
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("무슨 코인 상점 일괄 구매", () => {
  it("공개 플래그가 꺼지면 조회와 구매를 모두 숨긴다", async () => {
    vi.stubEnv("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN", "false");
    vi.mocked(canAccessMuseunCoinShop).mockResolvedValue(false);

    expect((await GET()).status).toBe(404);
    expect((await POST(request({ itemId: "rename_permit" }))).status).toBe(404);
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("공개 플래그가 꺼져도 허용된 심의 계정은 조회와 구매가 가능하다", async () => {
    vi.stubEnv("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN", "false");
    vi.mocked(canAccessMuseunCoinShop).mockResolvedValue(true);

    expect((await GET()).status).toBe(200);
    expect((await POST(request({ itemId: "rename_permit" }))).status).toBe(200);
  });

  it("선택한 수량의 총액을 한 번에 차감하고 가방 수량을 늘린다", async () => {
    const response = await POST(
      request({ itemId: "chroma_name_box", quantity: 5 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      itemId: "chroma_name_box",
      quantity: 5,
      totalPrice: 1_500,
      coins: 1_500,
      cashItems: { chroma_name_box: 7 },
    });
    expect(coinMocks.spend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "u-buyer",
        coins: 1_500,
        kind: "shop_purchase",
        sourceId: "chroma_name_box",
      }),
    );
  });

  it("클라이언트 구매 ID를 코인 원장 멱등 키로 사용한다", async () => {
    const response = await POST(
      request({
        itemId: "rename_permit",
        quantity: 1,
        purchaseId: "purchase_12345678",
      }),
    );

    expect(response.status).toBe(200);
    expect(coinMocks.spend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventKey: "shop:purchase_12345678" }),
    );
  });

  it("수량을 보내지 않은 기존 요청은 1개 구매로 처리한다", async () => {
    const response = await POST(request({ itemId: "rename_permit" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ quantity: 1, totalPrice: 400, coins: 2_600 });
  });

  it("대표 배지 전시대를 구매하면 3칸 전시 기능을 영구 해금한다", async () => {
    const response = await POST(request({ itemId: PROFILE_BADGE_STAND_ITEM_ID }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      itemId: PROFILE_BADGE_STAND_ITEM_ID,
      quantity: 1,
      totalPrice: PROFILE_BADGE_STAND_PRICE,
      coins: 3_000 - PROFILE_BADGE_STAND_PRICE,
      delivery: "permanent",
      profileBadgeStandOwned: true,
    });
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-buyer",
      "character.v2",
      expect.objectContaining({ profileBadgeStandOwned: true }),
    );
  });

  it("이미 보유한 전시대는 재구매할 수 없다", async () => {
    saves.set("character.v2", {
      profileBadgeStandOwned: true,
      cashItems: {},
    });

    const response = await POST(request({ itemId: PROFILE_BADGE_STAND_ITEM_ID }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("already_owned");
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("영구 전시대는 여러 개를 한 번에 살 수 없다", async () => {
    const response = await POST(
      request({ itemId: PROFILE_BADGE_STAND_ITEM_ID, quantity: 2 }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_quantity");
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 100, "broken"])(
    "허용 범위를 벗어난 수량 %s은 저장 전에 거부한다",
    async (quantity) => {
      const response = await POST(
        request({ itemId: "chroma_name_box", quantity }),
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_quantity");
      expect(lockSaveForUpdate).not.toHaveBeenCalled();
      expect(upsertSave).not.toHaveBeenCalled();
    },
  );

  it("여러 개의 총 결제액이 보유 코인을 넘으면 아무것도 저장하지 않는다", async () => {
    const response = await POST(
      request({ itemId: "adventure_support_30d", quantity: 4 }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: "insufficient_coins",
      coins: 3_000,
      requiredCoins: 4_000,
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("월간 회복약 세트를 구매하면 귀속 회복약 20개와 남은 횟수를 함께 저장한다", async () => {
    const response = await POST(
      request({ itemId: "monthly_stamina_potion_bundle" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      itemId: "monthly_stamina_potion_bundle",
      totalPrice: 300,
      coins: 2_700,
      delivery: "bundle",
      monthlyStaminaBundle: { purchases: 1, remaining: 2, limit: 3 },
    });
    expect(saves.get(STAMINA_POTIONS_KEY)).toEqual({
      count: 20,
      boundCount: 20,
    });
    expect(saves.get(GROWTH_LEAP_SAVE_KEY)).toMatchObject({
      monthlyPeriod: "2026-08",
      monthlyPurchases: 1,
    });
  });

  it("월간 세트는 세 번째까지만 결제하고 네 번째 요청에는 코인을 차감하지 않는다", async () => {
    for (let index = 0; index < 3; index += 1) {
      expect(
        (await POST(request({ itemId: "monthly_stamina_potion_bundle" }))).status,
      ).toBe(200);
    }
    const before = saves.get(MUSEUN_COIN_WALLET_KEY);
    const fourth = await POST(
      request({ itemId: "monthly_stamina_potion_bundle" }),
    );

    expect(fourth.status).toBe(409);
    expect(await fourth.json()).toMatchObject({ error: "monthly_limit" });
    expect(saves.get(MUSEUN_COIN_WALLET_KEY)).toEqual(before);
    expect(saves.get(STAMINA_POTIONS_KEY)).toEqual({
      count: 60,
      boundCount: 60,
    });
  });

  it("성장 도약 패키지는 회복약 30개와 꾸미기 상자 두 종류를 지급하고 평생 재구매를 막는다", async () => {
    const first = await POST(request({ itemId: "growth_leap_package" }));

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      itemId: "growth_leap_package",
      totalPrice: 1_200,
      coins: 1_800,
      delivery: "bundle",
      growthLeapPackage: { owned: true },
      cashItems: { chroma_name_box: 3, profile_border_box: 1 },
    });
    expect(saves.get(STAMINA_POTIONS_KEY)).toEqual({
      count: 30,
      boundCount: 30,
    });

    const second = await POST(request({ itemId: "growth_leap_package" }));
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: "already_owned" });
    expect(saves.get(MUSEUN_COIN_WALLET_KEY)).toEqual({ coins: 1_800 });
  });

  it("번들 상품은 구매 수량을 한 개로 고정한다", async () => {
    const response = await POST(
      request({ itemId: "growth_leap_package", quantity: 2 }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_quantity" });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("상점 조회는 월간 남은 횟수와 성장 도약 보유 여부를 반환한다", async () => {
    saves.set(GROWTH_LEAP_SAVE_KEY, {
      monthlyPeriod: "2026-08",
      monthlyPurchases: 2,
      mission: {
        purchasedAt: Date.now(),
        progressUntil: Date.now() + 30 * 86_400_000,
        claimUntil: Date.now() + 37 * 86_400_000,
        staminaSpent: 0,
        claimedMilestoneIds: [],
      },
    });

    expect(await (await GET()).json()).toMatchObject({
      monthlyStaminaBundle: { purchases: 2, remaining: 1, limit: 3 },
      growthLeapPackage: { owned: true },
    });
  });
});
