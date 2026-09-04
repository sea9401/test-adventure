import { describe, expect, it } from "vitest";
import {
  AGE_ELIGIBILITY_MAX_AGE_SECONDS,
  AGE_ELIGIBILITY_ENFORCEMENT_START_ISO,
  canAccessMinimumAgeService,
  createAgeEligibilityToken,
  isAgeEligibilityEnforced,
  verifyAgeEligibilityToken,
} from "./ageEligibility";

const SECRET = "test-auth-secret-at-least-32-characters";
const NOW = Date.UTC(2026, 8, 4, 0, 0, 0);

describe("만 14세 이상 확인 토큰", () => {
  it("2026년 10월 4일 00:00 한국시간부터 정확히 시행한다", () => {
    const enforcementStart = Date.parse("2026-10-04T00:00:00+09:00");

    expect(AGE_ELIGIBILITY_ENFORCEMENT_START_ISO).toBe(
      "2026-10-04T00:00:00+09:00",
    );
    expect(isAgeEligibilityEnforced(enforcementStart - 1)).toBe(false);
    expect(isAgeEligibilityEnforced(enforcementStart)).toBe(true);
  });

  it("시행 전에는 쿠키 없이 허용하고 시행 순간부터 유효한 쿠키를 요구한다", () => {
    const enforcementStart = Date.parse("2026-10-04T00:00:00+09:00");
    const token = createAgeEligibilityToken(SECRET, enforcementStart);

    expect(
      canAccessMinimumAgeService(null, undefined, enforcementStart - 1),
    ).toBe(true);
    expect(
      canAccessMinimumAgeService("invalid-token", SECRET, enforcementStart - 1),
    ).toBe(true);
    expect(
      canAccessMinimumAgeService(null, SECRET, enforcementStart),
    ).toBe(false);
    expect(
      canAccessMinimumAgeService("invalid-token", SECRET, enforcementStart),
    ).toBe(false);
    expect(
      canAccessMinimumAgeService(token, SECRET, enforcementStart),
    ).toBe(true);
  });

  it("서버가 발급한 현재 버전 토큰만 유효하게 판정한다", () => {
    const token = createAgeEligibilityToken(SECRET, NOW);

    expect(verifyAgeEligibilityToken(token, SECRET, NOW)).toBe(true);
    expect(verifyAgeEligibilityToken(token, SECRET + "-other", NOW)).toBe(false);
    expect(verifyAgeEligibilityToken(token + "tampered", SECRET, NOW)).toBe(false);
  });

  it("최대 보유 기간이 지난 토큰과 지나치게 미래인 토큰을 거부한다", () => {
    const token = createAgeEligibilityToken(SECRET, NOW);
    const expired = NOW + (AGE_ELIGIBILITY_MAX_AGE_SECONDS + 1) * 1000;

    expect(verifyAgeEligibilityToken(token, SECRET, expired)).toBe(false);
    expect(verifyAgeEligibilityToken(token, SECRET, NOW - 6 * 60 * 1000)).toBe(false);
  });

  it("비밀키가 없거나 형식이 잘못된 값은 실패 폐쇄한다", () => {
    expect(createAgeEligibilityToken("", NOW)).toBeNull();
    expect(verifyAgeEligibilityToken("v1.invalid.signature", SECRET, NOW)).toBe(false);
    expect(verifyAgeEligibilityToken(null, SECRET, NOW)).toBe(false);
    expect(verifyAgeEligibilityToken("v1.1.signature", "", NOW)).toBe(false);
  });
});
