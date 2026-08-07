import { describe, expect, it } from "vitest";
import { canPassMuseunCoinShopProxy } from "./museunCoinShopGate";

const closedEnv = {
  NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN: "false",
  MUSEUN_COIN_SHOP_REVIEW_USER_IDS: "review-1,review-2,review-3",
  ADMIN_EMAILS: "owner@example.com",
};

describe("무슨 코인 상점 Proxy 게이트", () => {
  it("일반 공개 뒤에는 로그인 여부와 무관하게 Proxy를 통과시킨다", () => {
    expect(
      canPassMuseunCoinShopProxy(null, {
        NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN: "true",
      }),
    ).toBe(true);
  });

  it("공개 전에는 비로그인·일반 계정을 막는다", () => {
    expect(canPassMuseunCoinShopProxy(null, closedEnv)).toBe(false);
    expect(
      canPassMuseunCoinShopProxy(
        { id: "ordinary", email: "player@example.com" },
        closedEnv,
      ),
    ).toBe(false);
  });

  it("심의 계정 UUID와 운영자 이메일만 허용한다", () => {
    expect(
      canPassMuseunCoinShopProxy(
        { id: "REVIEW-2", email: "review@example.invalid" },
        closedEnv,
      ),
    ).toBe(true);
    expect(
      canPassMuseunCoinShopProxy(
        { id: "owner", email: "OWNER@example.com" },
        closedEnv,
      ),
    ).toBe(true);
  });
});
