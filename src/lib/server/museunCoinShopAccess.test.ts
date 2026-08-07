import { afterEach, describe, expect, it, vi } from "vitest";
import { isMuseunCoinShopIdentityAllowed } from "./museunCoinShopAccess";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("무슨 코인 상점 심의 접근", () => {
  it("공개 플래그가 켜지면 모든 로그인 계정을 허용한다", () => {
    expect(
      isMuseunCoinShopIdentityAllowed(
        { email: "player@example.com", loginId: null },
        { NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN: "true" },
      ),
    ).toBe(true);
  });

  it("공개 전에는 운영자 이메일과 기본 심의 계정만 허용한다", () => {
    const env = {
      NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN: "false",
      ADMIN_EMAILS: "owner@example.com",
    };

    expect(
      isMuseunCoinShopIdentityAllowed(
        { email: "OWNER@example.com", loginId: null },
        env,
      ),
    ).toBe(true);
    expect(
      isMuseunCoinShopIdentityAllowed(
        {
          email: "review@example.invalid",
          loginId: "gcrb-review-02",
        },
        env,
      ),
    ).toBe(true);
    expect(
      isMuseunCoinShopIdentityAllowed(
        { email: "player@example.com", loginId: "ordinary-player" },
        env,
      ),
    ).toBe(false);
  });

  it("환경변수로 심의 계정 목록을 교체할 수 있다", () => {
    const env = {
      NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN: "false",
      MUSEUN_COIN_SHOP_REVIEW_LOGIN_IDS: "custom-review",
    };

    expect(
      isMuseunCoinShopIdentityAllowed(
        { email: "review@example.invalid", loginId: "custom-review" },
        env,
      ),
    ).toBe(true);
    expect(
      isMuseunCoinShopIdentityAllowed(
        { email: "review@example.invalid", loginId: "gcrb-review-01" },
        env,
      ),
    ).toBe(false);
  });
});
