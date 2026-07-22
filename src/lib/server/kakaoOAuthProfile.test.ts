import { describe, expect, it } from "vitest";
import { mapKakaoOAuthProfile } from "./kakaoOAuthProfile";

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
});
