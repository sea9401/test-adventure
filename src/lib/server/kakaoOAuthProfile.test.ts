import { describe, expect, it } from "vitest";
import {
  kakaoPlaceholderEmail,
  mapKakaoOAuthProfile,
} from "./kakaoOAuthProfile";

describe("Kakao OAuth profile", () => {
  it("유효하고 소유 확인된 이메일만 사용한다", () => {
    expect(
      mapKakaoOAuthProfile({
        id: 123,
        kakao_account: {
          email: "verified@example.com",
          is_email_valid: true,
          is_email_verified: true,
        },
      }).email,
    ).toBe("verified@example.com");
  });

  it.each([
    { is_email_valid: false, is_email_verified: true },
    { is_email_valid: true, is_email_verified: false },
    { is_email_valid: undefined, is_email_verified: true },
    { is_email_valid: true, is_email_verified: undefined },
  ])("검증 표식이 불완전하면 provider 고유 주소를 쓴다: %o", (flags) => {
    expect(
      mapKakaoOAuthProfile({
        id: "kakao-id",
        kakao_account: { email: "untrusted@example.com", ...flags },
      }).email,
    ).toBe("kakao_kakao-id@kakao.oauth");
  });

  it("provider id를 항상 같은 플레이스홀더 이메일로 만든다", () => {
    expect(kakaoPlaceholderEmail("12345")).toBe("kakao_12345@kakao.oauth");
  });
});
