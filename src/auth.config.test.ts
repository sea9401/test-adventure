import { describe, expect, it } from "vitest";
import { authConfig } from "./auth.config";

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
});
