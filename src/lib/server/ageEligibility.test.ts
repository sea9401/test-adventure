import { describe, expect, it } from "vitest";
import {
  AGE_ELIGIBILITY_MAX_AGE_SECONDS,
  createAgeEligibilityToken,
  verifyAgeEligibilityToken,
} from "./ageEligibility";

const SECRET = "test-auth-secret-at-least-32-characters";
const NOW = Date.UTC(2026, 8, 4, 0, 0, 0);

describe("만 14세 이상 확인 토큰", () => {
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
