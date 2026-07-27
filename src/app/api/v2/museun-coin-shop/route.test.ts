import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MUSEUN_COIN_WALLET_KEY } from "@/adventure/data/v2/museunCashItems";
import {
  PROFILE_BADGE_STAND_ITEM_ID,
  PROFILE_BADGE_STAND_PRICE,
} from "@/adventure/profile/profileShowcase";

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
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  readSave: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
}));

import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { GET, POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/museun-coin-shop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN", "true");
  vi.clearAllMocks();
  vi.mocked(lockSaveForUpdate).mockImplementation(
    async (_tx, _userId, key) => {
      if (key === "character.v2") {
        return { cashItems: { chroma_name_box: 2 } };
      }
      if (key === MUSEUN_COIN_WALLET_KEY) return { coins: 3_000 };
      return {};
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("무슨 코인 상점 일괄 구매", () => {
  it("공개 플래그가 꺼지면 조회와 구매를 모두 숨긴다", async () => {
    vi.stubEnv("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN", "false");

    expect((await GET()).status).toBe(404);
    expect((await POST(request({ itemId: "rename_permit" }))).status).toBe(404);
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(upsertSave).not.toHaveBeenCalled();
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
      totalPrice: 1_000,
      coins: 2_000,
      cashItems: { chroma_name_box: 7 },
    });
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-buyer",
      MUSEUN_COIN_WALLET_KEY,
      { coins: 2_000 },
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
    vi.mocked(lockSaveForUpdate).mockImplementation(
      async (_tx, _userId, key) => {
        if (key === "character.v2") {
          return { profileBadgeStandOwned: true, cashItems: {} };
        }
        if (key === MUSEUN_COIN_WALLET_KEY) return { coins: 3_000 };
        return {};
      },
    );

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
      requiredCoins: 3_200,
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
