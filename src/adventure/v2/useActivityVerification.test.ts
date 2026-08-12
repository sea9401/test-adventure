import { describe, expect, it } from "vitest";
import { parseActivityVerificationChallenge } from "./useActivityVerification";

describe("parseActivityVerificationChallenge", () => {
  it("관리자 요청 여부를 사람 확인 화면 모델에 보존한다", () => {
    expect(
      parseActivityVerificationChallenge(
        {
          error: "human_verification_required",
          activity: "mining",
          siteKey: "turnstile-site",
          captchaSiteKey: "captcha-site",
          reason: "strong_signal",
          manualTest: true,
        },
        "mining",
      ),
    ).toEqual({
      activity: "mining",
      siteKey: "turnstile-site",
      captchaSiteKey: "captcha-site",
      reason: "strong_signal",
      manualTest: true,
    });
  });

  it("기존 서버 응답은 실제 판정으로 해석한다", () => {
    expect(
      parseActivityVerificationChallenge(
        {
          error: "human_verification_required",
          activity: "fishing",
          siteKey: "turnstile-site",
          reason: "volume",
        },
        "fishing",
      ),
    ).toMatchObject({ manualTest: false });
  });
});
