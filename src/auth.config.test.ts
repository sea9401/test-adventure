import { describe, expect, it } from "vitest";
import {
  authConfig,
  isAuthorizedRequest,
  PUBLIC_PATHS,
} from "./auth.config";

describe("출시 OAuth provider 설정", () => {
  it("카카오만 등록하고 Google 직접 로그인 경로를 만들지 않는다", () => {
    const providerIds = authConfig.providers.map((provider) => {
      const resolved =
        typeof provider === "function"
          ? (provider as unknown as () => { id?: string })()
          : provider;
      return resolved.id;
    });

    expect(providerIds).toContain("kakao");
    expect(providerIds).not.toContain("google");
  });

  it("로그인 전에도 법적 정책을 확인할 수 있다", () => {
    expect(PUBLIC_PATHS).toEqual(
      expect.arrayContaining([
        "/terms",
        "/privacy",
        "/operations",
        "/licenses",
        "/game-info",
        "/notices/minimum-age-policy",
        "/api/age-eligibility",
      ]),
    );
  });

  it("닫힌 코인 상점은 인증 화면으로 새지 않고 자체 404 게이트까지 통과시킨다", () => {
    expect(process.env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN).not.toBe("true");
    expect(PUBLIC_PATHS).toEqual(
      expect.arrayContaining([
        "/settings/coin-shop",
        "/api/v2/museun-coin-shop",
      ]),
    );
  });

  it("로그아웃 완료 표식이 있으면 남아 있는 JWT로 보호 경로에 재진입하지 못한다", () => {
    expect(isAuthorizedRequest("/", true, true, true)).toBe(false);
    expect(isAuthorizedRequest("/api/v2/me/state", true, true, true)).toBe(false);
    expect(isAuthorizedRequest("/sign-in", true, true, false)).toBe(true);
    expect(isAuthorizedRequest("/", true, false, true)).toBe(true);
  });

  it("연령 확인이 없으면 로그인 JWT가 있어도 보호 페이지와 API를 막는다", () => {
    expect(isAuthorizedRequest("/", true, false, false)).toBe(false);
    expect(isAuthorizedRequest("/api/v2/me/state", true, false, false)).toBe(false);
    expect(isAuthorizedRequest("/terms", true, false, false)).toBe(true);
    expect(isAuthorizedRequest("/game-info", false, false, false)).toBe(true);
    expect(
      isAuthorizedRequest(
        "/notices/minimum-age-policy",
        false,
        false,
        false,
      ),
    ).toBe(true);
  });

  it("Auth.js 로그인 시작과 callback 직접 호출도 연령 확인 전에 막는다", () => {
    expect(
      isAuthorizedRequest("/api/auth/signin/kakao", false, false, false),
    ).toBe(false);
    expect(
      isAuthorizedRequest("/api/auth/callback/kakao", false, false, false),
    ).toBe(false);
    expect(
      isAuthorizedRequest("/api/auth/callback/review-credentials", false, false, true),
    ).toBe(true);
    expect(isAuthorizedRequest("/api/auth/signout", true, false, false)).toBe(true);
    expect(isAuthorizedRequest("/api/auth/session", true, false, false)).toBe(true);
  });
});
